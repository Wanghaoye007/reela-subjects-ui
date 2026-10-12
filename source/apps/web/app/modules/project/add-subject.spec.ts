import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = await vi.hoisted(async () => {
  const { createDrizzleMock } = await import('~/test/drizzle-mock');
  const db = createDrizzleMock();
  return {
    db,
    inTransaction: vi.fn(async (callback: (tx: typeof db) => Promise<unknown>) => callback(db)),
  };
});
const media = vi.hoisted(() => ({ upload: vi.fn(), paint: vi.fn() }));
const regenerate = vi.hoisted(() => vi.fn());
vi.mock('./regen-subject.server', () => ({ regenSubject: regenerate }));
vi.mock('~/lib/db/runtime.server', () => database);
vi.mock('@repo/id-gen/utils', () => ({ decodeId: (value: string) => BigInt(value) }));
vi.mock('@repo/id-gen/generator', () => ({ genSnowFlakeId: () => 456n }));
vi.mock('@repo/s3', () => ({ BUCKET: { FILES: 'FILES' }, s3Upload: media.upload }));
vi.mock('~/lib/clients/worker-api.server', () => ({
  workerApi: { reflix: { paintSubjectName: media.paint } },
}));
import { addSubjects } from './add-subject.server';

const input = () => ({
  reflixId: '123',
  name: 'Hero',
  category: 'Character',
  image: new File(['image'], 'hero.png', { type: 'image/png' }),
});

describe('addSubjects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.db.query.reflixProjects.findFirst.mockResolvedValue({ id: 20n });
    vi.stubEnv('FILES_PUBLIC_BASE_URL', 'https://files.example.com');
    vi.stubEnv('S3_BUCKET_FILES_NAME', 'reela-files');
    media.upload.mockResolvedValue('reflix/image/hero.png');
    media.paint.mockResolvedValue('https://files.example.com/reflix/image/hero-named.png');
    regenerate.mockResolvedValue({ taskId: 'job-new', subjectId: '456', status: 'queued' });
  });
  it('stores the Subject and its current image on the same transaction after media generation', async () => {
    await addSubjects(input(), 42!);
    expect(database.inTransaction).toHaveBeenCalledOnce();
    expect(media.paint).toHaveBeenCalledWith({
      url: 'https://files.example.com/reflix/image/hero.png',
      text: 'Hero',
    });
    expect(database.db.writes.reflixSubjects.values).toHaveBeenCalledWith({
      id: 456n,
      userId: 42,
      name: 'Hero',
      category: 'Character',
      subjectId: 'C:hero',
      reflixId: 123n,
    });
    expect(database.db.writes.subjectImages.values).toHaveBeenCalledWith({
      subjectId: 456n,
      userId: 42,
      reflixId: 123n,
      bucket: 'reela-files',
      key: 'reflix/image/hero.png',
      keyWithName: 'reflix/image/hero-named.png',
      source: 'generated',
      isCurrent: true,
    });
    expect(database.inTransaction.mock.invocationCallOrder[0]).toBeGreaterThan(
      media.paint.mock.invocationCallOrder[0],
    );
  });
  it('does not report success when current-image persistence fails', async () => {
    database.db.writes.subjectImages.values.mockRejectedValueOnce(new Error('image insert failed'));
    await expect(addSubjects(input(), 42!)).rejects.toThrow('image insert failed');
  });

  it('creates an owned subject before queueing generation with the uploaded reference', async () => {
    const reference = new File(['ref'], 'reference.png', { type: 'image/png' });
    const result = await addSubjects({ reflixId: '123', name: 'Hero', category: 'character',
      mode: 'generate', imagePrompt: 'A hero matching the reference', model: 'seedream',
      parentImage: reference, imageWidth: 1600, imageHeight: 900 }, 42);
    expect(database.db.writes.reflixSubjects.values).toHaveBeenCalledWith(expect.objectContaining({
      id: 456n, userId: 42, reflixId: 123n, imagePrompt: 'A hero matching the reference',
    }));
    expect(regenerate).toHaveBeenCalledWith(expect.objectContaining({
      subjectDbId: '456', projectId: '123', parentImage: reference, model: 'seedream',
    }), 42);
    expect(database.db.writes.reflixSubjects.values.mock.invocationCallOrder[0]).toBeLessThan(regenerate.mock.invocationCallOrder[0]);
    expect(media.upload).not.toHaveBeenCalled();
    expect(media.paint).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'queued', subjectId: '456' });
  });

  it('preserves every reference when creating and queueing a subject', async () => {
    const referenceImages = ['https://example.com/a.png', new File(['ref'], 'b.png', { type: 'image/png' })];
    await addSubjects({ reflixId: '123', name: 'Hero', category: 'character', mode: 'generate',
      imagePrompt: 'Use both references', model: 'seedream', referenceImages }, 42);
    expect(regenerate).toHaveBeenCalledWith(expect.objectContaining({ referenceImages }), 42);
  });

  it('returns the persisted subject for retry when generation cannot be queued', async () => {
    regenerate.mockRejectedValueOnce(new Error('queue unavailable'));
    const result = await addSubjects({ reflixId: '123', name: 'Hero', category: 'character',
      mode: 'generate', imagePrompt: 'A hero' }, 42);
    expect(result).toMatchObject({ subjectId: '456', generationError: expect.any(String) });
    expect(database.db.writes.reflixSubjects.values).toHaveBeenCalledOnce();
    expect(database.db.writes.subjectImages.values).not.toHaveBeenCalled();
  });

  it('rejects empty prompts and reference-incompatible models before creating a subject', async () => {
    await expect(addSubjects({ reflixId: '123', name: 'Hero', category: 'character', mode: 'generate',
      imagePrompt: ' ' }, 42)).rejects.toThrow();
    await expect(addSubjects({ reflixId: '123', name: 'Hero', category: 'character', mode: 'generate',
      imagePrompt: 'A hero', model: 'wan', parentImage: new File(['ref'], 'ref.png', { type: 'image/png' }) }, 42)).rejects.toThrow();
    expect(database.db.writes.reflixSubjects.values).not.toHaveBeenCalled();
  });
});
