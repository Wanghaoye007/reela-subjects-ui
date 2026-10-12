import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '~/lib/api/api-error.server';

const database = await vi.hoisted(async () => {
  const { createDrizzleMock } = await import('~/test/drizzle-mock');
  return { db: createDrizzleMock() };
});
const getUserBalanceMock = vi.hoisted(() => vi.fn());
const submitSubjectRegenJobMock = vi.hoisted(() => vi.fn());
const getUserPendingSubjectRegenCountMock = vi.hoisted(() => vi.fn());
const getUserPendingSubjectRegenReservedCreditsMock = vi.hoisted(() => vi.fn());
const markSubjectRegenQueuedMock = vi.hoisted(() => vi.fn());
const markSubjectRegenFinishedMock = vi.hoisted(() => vi.fn());
const s3UploadMock = vi.hoisted(() => vi.fn());
const redisMocks = vi.hoisted(() => ({
  acquireLockInRedis: vi.fn(),
  releaseLockInRedis: vi.fn(),
}));

vi.mock('~/lib/db/runtime.server', () => database);
vi.mock('~/modules/credits/get-user-balance.server', () => ({
  getUserBalance: getUserBalanceMock,
}));
vi.mock('~/modules/project/subject-regen-queue.server', () => ({
  submitSubjectRegenJob: submitSubjectRegenJobMock,
}));
vi.mock('@repo/bullmq/subject-regen-state', () => ({
  getUserPendingSubjectRegenCount: getUserPendingSubjectRegenCountMock,
  getUserPendingSubjectRegenReservedCredits: getUserPendingSubjectRegenReservedCreditsMock,
  markSubjectRegenQueued: markSubjectRegenQueuedMock,
  markSubjectRegenFinished: markSubjectRegenFinishedMock,
}));
vi.mock('@repo/id-gen/utils', () => ({ decodeId: (id: string) => BigInt(id) }));
vi.mock('@repo/s3', () => ({
  BUCKET: { FILES: 'files' },
  s3Upload: s3UploadMock,
  s3GetSignedUrl: vi.fn(),
}));
vi.mock('~/lib/clients/worker-api.server', () => ({
  workerApi: { reflix: { generateSubject: vi.fn(), paintSubjectName: vi.fn() } },
}));
vi.mock('~/modules/credits/calc-credits-by-worker-usage.server', () => ({
  calcCreditsByWorkerUsage: vi.fn(),
}));
vi.mock('~/modules/credits/consume-credits.server', () => ({
  consumeCredits: vi.fn(),
}));
vi.mock('@repo/redis', () => redisMocks);
vi.mock('@repo/credits-calculator', () => ({
  calculateImageCredits: vi.fn(({ model }: { model: string }) =>
    model === 'nano-banana-pro' ? 6 : 4,
  ),
}));
vi.mock('crypto', () => ({ randomBytes: () => ({ toString: () => 'abc123' }) }));

import { regenSubject } from './regen-subject.server';

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    projectId: '123',
    subjectId: '456',
    displayName: 'Hero',
    imagePrompt: 'A heroic portrait',
    model: 'seedream' as const,
    imageWidth: 1600,
    imageHeight: 900,
    ...overrides,
  };
}

const userId = 42;

describe('regenSubject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('FILES_PUBLIC_BASE_URL', 'https://files.example.com');
    getUserBalanceMock.mockResolvedValue(10);
    getUserPendingSubjectRegenCountMock.mockResolvedValue(0);
    redisMocks.acquireLockInRedis.mockResolvedValue(true);
    redisMocks.releaseLockInRedis.mockResolvedValue(true);
    getUserPendingSubjectRegenReservedCreditsMock.mockResolvedValue(0);
    database.db.query.reflixSubjects.findFirst.mockResolvedValue({
      id: 456n,
      subjectId: 'C:Hero',
      displayName: 'Hero',
      reflixId: 123n,
      userId: 42,
    });
    database.db.writes.reflixSubjects.set.mockResolvedValue({});
    submitSubjectRegenJobMock.mockResolvedValue(undefined);
  });

  it('marks a deterministic task queued before submitting subject image generation through the dispatcher', async () => {
    const result = await regenSubject(makeInput(), userId);

    expect(database.db.query.reflixSubjects.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 456n,
          userId: 42,
          reflixId: 123n,
        },
      }),
    );
    expect(submitSubjectRegenJobMock).toHaveBeenCalledWith(
      'regen_subject_image',
      expect.objectContaining({
        userId: 42,
        projectId: '123',
        reflixId: '123',
        subjectDbId: '456',
        subjectId: 'C:Hero',
        displayName: 'Hero',
        imagePrompt: 'A heroic portrait',
        model: 'seedream',
        aspectRatio: '16:9',
      }),
      expect.objectContaining({
        jobId: 'abc123',
        removeOnComplete: { age: 86400, count: 1000 },
        removeOnFail: { age: 604800, count: 1000 },
      }),
    );
    expect(database.db.writes.reflixSubjects.set).toHaveBeenCalledWith(
      { imagePrompt: 'A heroic portrait', mtime: expect.any(Date) },
      expect.objectContaining({ params: [456n] }),
    );
    expect(database.db.writes.reflixSubjects.set.mock.invocationCallOrder[0]).toBeLessThan(
      submitSubjectRegenJobMock.mock.invocationCallOrder[0],
    );
    expect(markSubjectRegenQueuedMock).toHaveBeenCalledWith({
      userId: 42,
      reflixId: '123',
      subjectDbId: '456',
      taskId: 'abc123',
      reservedCredits: 4,
    });
    expect(markSubjectRegenQueuedMock.mock.invocationCallOrder[0]).toBeLessThan(
      submitSubjectRegenJobMock.mock.invocationCallOrder[0],
    );
    expect(result).toMatchObject({
      taskId: 'abc123',
      subjectId: '456',
      status: 'queued',
    });
  });

  it('clears the queued state when enqueueing fails', async () => {
    submitSubjectRegenJobMock.mockRejectedValueOnce(new Error('redis down'));

    await expect(regenSubject(makeInput(), userId)).rejects.toThrow('redis down');

    expect(markSubjectRegenFinishedMock).toHaveBeenCalledWith({
      userId: 42,
      reflixId: '123',
      subjectDbId: '456',
      taskId: 'abc123',
      reservedCredits: 4,
      status: 'failed',
    });
  });

  it('accepts tasks beyond three pending subject image generations and lets the dispatcher queue them', async () => {
    getUserPendingSubjectRegenCountMock.mockResolvedValue(3);

    await expect(regenSubject(makeInput(), userId)).resolves.toMatchObject({
      status: 'queued',
    });
    expect(submitSubjectRegenJobMock).toHaveBeenCalled();
  });

  it('rejects when available credits cannot cover the selected model plus pending reservations', async () => {
    getUserBalanceMock.mockResolvedValue(10);
    getUserPendingSubjectRegenReservedCreditsMock.mockResolvedValue(6);

    await expect(
      regenSubject(makeInput({ model: 'nano-banana-pro' }), userId),
    ).rejects.toMatchObject({
      userMessage: 'Insufficient credits, please upgrade your plan or top up your balance.',
    });
    expect(submitSubjectRegenJobMock).not.toHaveBeenCalled();
  });

  it('rejects instead of racing when another subject generation reservation is in progress', async () => {
    redisMocks.acquireLockInRedis.mockResolvedValueOnce(false);

    await expect(regenSubject(makeInput(), userId)).rejects.toMatchObject({
      userMessage: 'Another subject generation is being queued. Please try again.',
    });
    expect(markSubjectRegenQueuedMock).not.toHaveBeenCalled();
    expect(submitSubjectRegenJobMock).not.toHaveBeenCalled();
  });

  it('keeps slow subject lookup and reference uploads outside the enqueue lock', async () => {
    s3UploadMock.mockResolvedValueOnce('reflix/image/reference.jpg');
    const parentImage = new File(['image-bytes'], 'parent.png', { type: 'image/png' });

    await regenSubject(makeInput({ parentImage }), userId);

    expect(database.db.query.reflixSubjects.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      redisMocks.acquireLockInRedis.mock.invocationCallOrder[0],
    );
    expect(s3UploadMock.mock.invocationCallOrder[0]).toBeLessThan(
      redisMocks.acquireLockInRedis.mock.invocationCallOrder[0],
    );
    expect(s3UploadMock).toHaveBeenCalledWith(expect.objectContaining({
      source: parentImage, contentType: 'image/png', key: 'reflix/image/abc123.png',
    }));
    expect(submitSubjectRegenJobMock).toHaveBeenCalledWith('regen_subject_image',
      expect.objectContaining({ referenceImageUrl: 'https://files.example.com/reflix/image/reference.jpg' }),
      expect.any(Object));
    expect(getUserBalanceMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      redisMocks.acquireLockInRedis.mock.invocationCallOrder[0],
    );
    expect(markSubjectRegenQueuedMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      redisMocks.acquireLockInRedis.mock.invocationCallOrder[0],
    );
  });

  it('queues every reference in order with mixed upload and URL inputs', async () => {
    const reference = new File(['bytes'], 'second.png', { type: 'image/png' });
    s3UploadMock.mockResolvedValueOnce('reflix/image/second.png');
    await regenSubject(makeInput({ referenceImages: ['https://example.com/first.png', reference,
      'https://example.com/third.png', 'https://example.com/first.png'] }), userId);
    expect(submitSubjectRegenJobMock).toHaveBeenCalledWith('regen_subject_image', expect.objectContaining({
      referenceImageUrls: ['https://example.com/first.png', 'https://files.example.com/reflix/image/second.png',
        'https://example.com/third.png'],
    }), expect.any(Object));
    expect(s3UploadMock).toHaveBeenCalledWith(expect.objectContaining({ source: reference }));
  });

  it('rejects subjects that do not belong to the current user project', async () => {
    database.db.query.reflixSubjects.findFirst.mockResolvedValue(null);

    await expect(regenSubject(makeInput(), userId)).rejects.toBeInstanceOf(ApiError);
    expect(submitSubjectRegenJobMock).not.toHaveBeenCalled();
  });
});
