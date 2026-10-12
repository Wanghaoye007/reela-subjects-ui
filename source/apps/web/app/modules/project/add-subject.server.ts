import { requireOwnedReflix } from './project-access.server';
import { addSubjectSchema as schema } from './project-contract';
import z from 'zod';
import mime from 'mime';
import { db, inTransaction } from '~/lib/db/runtime.server';
import { reflixSubjects, subjectImages } from '@repo/drizzle/schema';
import crypto from 'crypto';
import { parseResourceId as decodeId } from '~/lib/api/api-error.server';
import { genSnowFlakeId } from '@repo/id-gen/generator';
import { snakeCase } from 'change-case-all';
import { BUCKET, s3Upload } from '@repo/s3';
import { s3ObjectKeyFromUrl } from '@repo/s3/object-key';
import { workerApi } from '~/lib/clients/worker-api.server';
import { ApiError } from '~/lib/api/api-error.server';

export const addSubjects = async (input: z.input<typeof schema>, userId: number) => {
  const data = schema.parse(input);
  await requireOwnedReflix(input.reflixId, userId);

  if (data.mode === 'generate') {
    const subjectId = genSnowFlakeId();
    // Persist the owned Subject before queueing. Failed admission leaves an editable
    // Subject with its prompt, so the user can retry without creating a duplicate.
    await db.insert(reflixSubjects).values({
      id: subjectId, userId, reflixId: decodeId(data.reflixId),
      name: data.name, displayName: data.name, category: data.category,
      subjectId: toSubjectId(data.category, data.name), imagePrompt: data.imagePrompt,
    });
    try {
      const { regenSubject } = await import('./regen-subject.server');
      const result = await regenSubject({
        projectId: data.reflixId, subjectDbId: subjectId.toString(),
        subjectId: subjectId.toString(), displayName: data.name,
        imagePrompt: data.imagePrompt!, model: data.model, parentImage: data.parentImage, referenceImages: data.referenceImages,
        imageWidth: data.imageWidth, imageHeight: data.imageHeight,
      }, userId);
      return { ...result, message: 'Subject created. Image generation started.' };
    } catch (error) {
      return {
        subjectId: subjectId.toString(),
        message: 'Subject created; image generation did not start.',
        generationError: error instanceof ApiError ? error.userMessage :
          'Image generation could not start. Open this subject to retry.',
      };
    }
  }

  const upload = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const ext = mime.getExtension(file.type);
    const md5 = crypto.createHash('md5').update(buffer).digest('hex');
    const key = await s3Upload({
      bucket: BUCKET.FILES,
      key: `reflix/image/${md5}.${ext}`,
      source: buffer,
      acl: 'public-read',
      contentType: file.type,
      fileName: file.name,
      downloadBehavior: 'play-in-browser',
    });
    return { key, url: `${process.env.FILES_PUBLIC_BASE_URL}/${key}` };
  };

  const { key, url: imageUrl } = await upload(data.image!);
  const imageWithNameUrl = await workerApi.reflix.paintSubjectName({
    url: imageUrl,
    text: data.name,
  });
  const keyWithName = s3ObjectKeyFromUrl({
    value: imageWithNameUrl,
    bucketName: process.env.S3_BUCKET_FILES_NAME!,
    publicBaseUrl: process.env.FILES_PUBLIC_BASE_URL,
  });

  const subjectId = genSnowFlakeId();

  await inTransaction(async (tx) => {
    await tx.insert(reflixSubjects).values({
      id: subjectId,
      userId: userId,
      name: data.name,
      category: data.category,
      subjectId: toSubjectId(data.category, data.name),
      reflixId: decodeId(data.reflixId),
    });
    await tx.insert(subjectImages).values({
      subjectId,
      userId: userId,
      reflixId: decodeId(data.reflixId),
      bucket: 'reela-files',
      key,
      keyWithName,
      source: 'generated',
      isCurrent: true,
    });
  });

  return {
    message: 'Subject created',
    subjectId: subjectId.toString(),
  };
};

function toSubjectId(category: string, name: string) {
  const c = category[0].toUpperCase();
  const n = snakeCase(name);
  return `${c}:${n}`;
}
