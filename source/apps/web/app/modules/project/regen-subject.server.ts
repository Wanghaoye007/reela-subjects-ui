import { regenSubjectSchema as schema } from './project-contract';

import { ApiError } from '~/lib/api/api-error.server';
import {
  getUserPendingSubjectRegenReservedCredits,
  markSubjectRegenFinished,
  markSubjectRegenQueued,
} from '@repo/bullmq/subject-regen-state';
import { calculateImageCredits } from '@repo/credits-calculator';
import { parseResourceId as decodeId } from '~/lib/api/api-error.server';
import { acquireLockInRedis, releaseLockInRedis } from '@repo/redis';
import { BUCKET, s3Upload } from '@repo/s3';
import { randomBytes } from 'crypto';
import z from 'zod';
import { submitSubjectRegenJob } from '~/modules/project/subject-regen-queue.server';
import { db } from '~/lib/db/runtime.server';
import { reflixSubjects } from '@repo/drizzle/schema';
import { eq } from 'drizzle-orm';
import { requireRecord } from '~/lib/db/require-record.server';
import { getUserBalance } from '~/modules/credits/get-user-balance.server';

const SUBJECT_REGEN_COMPLETE_RETENTION_SECONDS = 24 * 60 * 60;
const SUBJECT_REGEN_FAIL_RETENTION_SECONDS = 7 * 24 * 60 * 60;

export async function regenSubject(input: z.infer<typeof schema>, userId: number) {
  if (!userId) {
    throw new ApiError({ status: 401, userMessage: 'Unauthorized' });
  }

  const { success, data, error } = schema.safeParse(input);

  if (!success) {
    const prettifyError = z.prettifyError(error);
    const msg = process.env.NODE_ENV === 'development' ? prettifyError : 'Invalid data';
    throw new ApiError({ status: 400, userMessage: msg, internalMessage: prettifyError });
  }

  const estimatedCredits = calculateImageCredits({ model: data.model, num: 1 });
  if (estimatedCredits <= 0) {
    throw new ApiError({ status: 400, userMessage: 'Unsupported image model.' });
  }

  const projectDbId = decodeId(data.projectId);
  const subjectDbId = decodeId(data.subjectDbId ?? data.subjectId);

  const subject = await db.query.reflixSubjects.findFirst({
    where: { id: subjectDbId, userId, reflixId: projectDbId },
    columns: { id: true, subjectId: true, displayName: true, reflixId: true, userId: true },
  });

  if (!subject || !subject.reflixId || !subject.userId) {
    throw new ApiError({
      userMessage: 'Subject not found',
      internalMessage: `Subject ${data.subjectDbId ?? data.subjectId} not found for project ${data.projectId}`,
      status: 404,
    });
  }

  const aspectRatio = getClosestAspectRatio(data.imageWidth, data.imageHeight);

  const references = data.referenceImages ?? (data.parentImage ? [data.parentImage] : []);
  const referenceImageUrls: string[] = [];
  for (const reference of references) {
    if (typeof reference === 'string') {
      if (reference && !referenceImageUrls.includes(reference)) referenceImageUrls.push(reference);
    } else {
      const key = await s3Upload({
        bucket: BUCKET.FILES,
        key: `reflix/image/${randomHex32()}.${reference.type === 'image/png' ? 'png' : 'jpg'}`,
        source: reference, acl: 'public-read', contentType: reference.type,
        downloadBehavior: 'play-in-browser',
      });
      referenceImageUrls.push(`${process.env.FILES_PUBLIC_BASE_URL}/${key}`);
    }
  }

  const taskId = randomHex32();
  const stateInput = {
    userId,
    reflixId: subject.reflixId.toString(),
    subjectDbId: subject.id.toString(),
    taskId,
    reservedCredits: estimatedCredits,
  };

  const releaseLock = await acquireSubjectRegenUserLock(userId);
  try {
    const [userBalance, pendingReservedCredits] = await Promise.all([
      getUserBalance(userId),
      getUserPendingSubjectRegenReservedCredits(userId),
    ]);
    if (userBalance - pendingReservedCredits < estimatedCredits) {
      throw new ApiError({
        status: 402,
        userMessage: 'Insufficient credits, please upgrade your plan or top up your balance.',
      });
    }

    requireRecord(
      (
        await db
          .update(reflixSubjects)
          .set({ imagePrompt: data.imagePrompt, mtime: new Date() })
          .where(eq(reflixSubjects.id, subject.id))
          .returning({ id: reflixSubjects.id })
      )[0],
    );

    try {
      await markSubjectRegenQueued(stateInput);

      await submitSubjectRegenJob(
        'regen_subject_image',
        {
          userId,
          projectId: subject.reflixId.toString(),
          reflixId: subject.reflixId.toString(),
          subjectDbId: subject.id.toString(),
          subjectId: subject.subjectId,
          displayName: data.displayName || subject.displayName || subject.subjectId,
          imagePrompt: data.imagePrompt,
          model: data.model,
          aspectRatio,
          ...(referenceImageUrls.length > 1 ? { referenceImageUrls } : { referenceImageUrl: referenceImageUrls[0] }),
        },
        {
          jobId: taskId,
          removeOnComplete: { age: SUBJECT_REGEN_COMPLETE_RETENTION_SECONDS, count: 1000 },
          removeOnFail: { age: SUBJECT_REGEN_FAIL_RETENTION_SECONDS, count: 1000 },
        },
      );
    } catch (err) {
      await markSubjectRegenFinished({ ...stateInput, status: 'failed' });
      throw err;
    }
  } finally {
    await releaseLock();
  }

  return {
    taskId,
    subjectId: subject.id.toString(),
    status: 'queued' as const,
    message: 'Generation started. You can continue editing other subjects.',
  };
}

function getClosestAspectRatio(width: number, height: number) {
  const actualRatio = width / height;

  const ratios = [
    { name: '16:9', value: 16 / 9 },
    { name: '4:3', value: 4 / 3 },
    { name: '3:4', value: 3 / 4 },
    { name: '9:16', value: 9 / 16 },
    { name: '1:1', value: 1 },
  ] as const;

  let closest = ratios[0] as (typeof ratios)[number];
  let minDiff = Math.abs(actualRatio - ratios[0].value);

  for (const r of ratios) {
    const diff = Math.abs(actualRatio - r.value);
    if (diff < minDiff) {
      minDiff = diff;
      closest = r;
    }
  }

  return closest.name;
}

async function acquireSubjectRegenUserLock(userId: number) {
  const key = `subject_generation:user:${userId}:enqueue_lock`;
  const token = randomHex32();
  const acquired = await acquireLockInRedis(key, token, 15);
  if (!acquired) {
    throw new ApiError({
      userMessage: 'Another subject generation is being queued. Please try again.',
      status: 409,
    });
  }

  return async () => {
    await releaseLockInRedis(key, token);
  };
}

function randomHex32() {
  return randomBytes(16).toString('hex');
}
