import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const database = await vi.hoisted(async () => {
  const { createWorkerDbMock } = await import('../../../utils/db-test');
  return createWorkerDbMock();
});

const workerApiMock = vi.hoisted(() => ({
  reflix: {
    generateSubject: vi.fn(),
    paintSubjectName: vi.fn(),
  },
}));

const s3UploadMock = vi.hoisted(() => vi.fn());
const s3GetSignedUrlMock = vi.hoisted(() => vi.fn());
const publishUserEventMock = vi.hoisted(() => vi.fn().mockResolvedValue('published'));
const markSubjectRegenProcessingMock = vi.hoisted(() => vi.fn());
const markSubjectRegenFinishedMock = vi.hoisted(() => vi.fn());
const remHashFromRedisMock = vi.hoisted(() => vi.fn());

vi.mock('../../../utils/db', () => ({ inTransaction: (callback: any) => callback(database) }));
vi.mock('../../../utils/worker-api', () => ({ workerApi: workerApiMock }));
vi.mock('@repo/s3', () => ({
  BUCKET: { FILES: 'files' },
  s3Upload: s3UploadMock,
  s3GetSignedUrl: s3GetSignedUrlMock,
}));
vi.mock('@repo/bullmq/subject-regen-state', () => ({
  markSubjectRegenProcessing: markSubjectRegenProcessingMock,
  markSubjectRegenFinished: markSubjectRegenFinishedMock,
}));
vi.mock('@repo/redis', () => ({
  publishUserEvent: publishUserEventMock,
  remHashFromRedis: remHashFromRedisMock,
}));
vi.mock('@repo/id-gen/utils', () => ({ decodeId: (id: string) => BigInt(id) }));
vi.mock('@repo/credits-calculator', () => ({
  calculateImageCredits: vi.fn(() => 3),
}));
vi.mock('@repo/logger', () => ({
  childLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { regenSubjectImage } from './regen-subject-image';

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    data: {
      userId: 42,
      projectId: '999',
      reflixId: '123',
      subjectDbId: '456',
      subjectId: 'C:Hero',
      displayName: 'Hero',
      imagePrompt: 'A heroic portrait',
      model: 'seedream',
      aspectRatio: '16:9',
      referenceImageUrl: 'https://files.example/reference.jpg',
      ...overrides,
    },
  } as any;
}

describe('regenSubjectImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('FILES_PUBLIC_BASE_URL', 'https://files.xiaoyun.com');
    vi.stubEnv('S3_BUCKET_FILES_NAME', 'reela-files-cnaws');
    workerApiMock.reflix.generateSubject.mockResolvedValue({
      url: 'https://worker.example/generated.jpg',
      usages: [
        {
          agent_name: 'reflix',
          model_name: 'seedream',
          prompt_tokens: 10,
          completion_tokens: 20,
          cost: 1,
        },
      ],
    });
    s3UploadMock.mockImplementation(async ({ key }) => key);
    s3GetSignedUrlMock.mockResolvedValue('https://signed.example/generated.jpg');
    workerApiMock.reflix.paintSubjectName.mockResolvedValue(
      'https://example-files.s3.us-west-1.amazonaws.com/reflix/image/name.jpg?preview=mock',
    );
  });

  it('forwards the complete reference list instead of the legacy first image', async () => {
    const imageUrls = ['https://example.com/first.png', 'https://example.com/second.png'];
    await regenSubjectImage(makeJob({ referenceImageUrls: imageUrls }));
    expect(workerApiMock.reflix.generateSubject).toHaveBeenCalledWith({
      reflixId: '123', model: 'seedream', aspectRatio: '16:9', prompt: 'A heroic portrait', imageUrls,
    });
  });

  it('generates a subject image, makes it current, charges credits, and reports user state', async () => {
    await regenSubjectImage(makeJob());

    expect(publishUserEventMock).toHaveBeenCalledWith(
      '42',
      expect.objectContaining({
        type: 'reflix.progress',
        resourceId: '123',
        payload: { state: 'SUBJECT_GENERATION:PROCESSING', jobId: 'job-1' },
      }),
    );
    expect(markSubjectRegenProcessingMock).toHaveBeenCalledWith({
      userId: 42,
      reflixId: '123',
      subjectDbId: '456',
      taskId: 'job-1',
    });
    expect(workerApiMock.reflix.generateSubject).toHaveBeenCalledWith({
      reflixId: '123',
      model: 'seedream',
      aspectRatio: '16:9',
      prompt: 'A heroic portrait',
      imageUrl: 'https://files.example/reference.jpg',
    });
    expect(s3UploadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'files',
        source: 'https://worker.example/generated.jpg',
        acl: 'public-read',
      }),
    );
    expect(database.writes.subjectImages.set).toHaveBeenCalledWith(
      { isCurrent: false },
      expect.objectContaining({ params: [456n, 42, true] }),
    );
    expect(database.writes.subjectImages.values).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: 456n,
        userId: 42,
        reflixId: 123n,
        keyWithName: 'reflix/image/name.jpg',
        imagePrompt: 'A heroic portrait',
        imageModel: 'seedream',
        source: 'regenerated',
        isCurrent: true,
      }),
    );
    expect(database.writes.projectCost.values).toHaveBeenCalledWith([
      {
        projectId: 999n,
        agentName: 'reflix',
        modelName: 'seedream',
        promptTokens: 10,
        completionTokens: 20,
        cost: 1,
      },
    ]);
    expect(database.writes.reflixSubjects.set).not.toHaveBeenCalled();
    expect(database.writes.subjectImages.set.mock.invocationCallOrder[0]).toBeLessThan(
      database.writes.subjectImages.values.mock.invocationCallOrder[0],
    );
    expect(database.writes.balanceTransaction.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        action: 'consume',
        amount: 3,
        referId: 999n,
        referType: 'projects',
        reference: expect.objectContaining({
          source: 'reflix_regen_async',
          type: 'images',
          reflixId: '123',
          subjectId: 'C:Hero',
          subjectDbId: '456',
          imageModel: 'seedream',
        }),
      }),
    );
    expect(remHashFromRedisMock).toHaveBeenCalledWith('reflix:subject_warnings:123', ['456']);
    expect(remHashFromRedisMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      database.writes.subjectImages.values.mock.invocationCallOrder[0],
    );
    expect(publishUserEventMock).toHaveBeenLastCalledWith(
      '42',
      expect.objectContaining({
        payload: { state: 'SUBJECT_GENERATION:COMPLETED', jobId: 'job-1' },
      }),
    );
    expect(markSubjectRegenFinishedMock).toHaveBeenCalledWith({
      userId: 42,
      reflixId: '123',
      subjectDbId: '456',
      taskId: 'job-1',
      status: 'completed',
    });
  });

  it('requires the shared subject row lock before replacing images', async () => {
    database.execute.mockRejectedValueOnce(new Error('lock unavailable'));
    await expect(regenSubjectImage(makeJob())).rejects.toThrow('lock unavailable');
    expect(new PgDialect().sqlToQuery(database.execute.mock.calls[0][0])).toEqual(
      expect.objectContaining({
        sql: 'SELECT id FROM reflix_subjects WHERE id = $1 FOR UPDATE',
        params: [456n],
      }),
    );
    expect(database.writes.subjectImages.set).not.toHaveBeenCalled();
    expect(database.writes.subjectImages.values).not.toHaveBeenCalled();
  });

  it('keeps the generation successful when clearing a stale subject warning fails', async () => {
    remHashFromRedisMock.mockRejectedValueOnce(new Error('redis down'));

    await regenSubjectImage(makeJob());

    expect(markSubjectRegenFinishedMock).toHaveBeenCalledWith({
      userId: 42,
      reflixId: '123',
      subjectDbId: '456',
      taskId: 'job-1',
      status: 'completed',
    });
    expect(publishUserEventMock).toHaveBeenLastCalledWith(
      '42',
      expect.objectContaining({
        payload: { state: 'SUBJECT_GENERATION:COMPLETED', jobId: 'job-1' },
      }),
    );
  });

  it('marks the subject generation failed and clears pending state when generation throws', async () => {
    workerApiMock.reflix.generateSubject.mockRejectedValueOnce(new Error('worker down'));

    await expect(regenSubjectImage(makeJob())).rejects.toThrow('worker down');

    expect(remHashFromRedisMock).not.toHaveBeenCalled();
    expect(markSubjectRegenFinishedMock).toHaveBeenCalledWith({
      userId: 42,
      reflixId: '123',
      subjectDbId: '456',
      taskId: 'job-1',
      status: 'failed',
    });
    expect(publishUserEventMock).toHaveBeenLastCalledWith(
      '42',
      expect.objectContaining({
        payload: { state: 'SUBJECT_GENERATION:FAILED', jobId: 'job-1' },
      }),
    );
  });
});
