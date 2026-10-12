import type { InferJobProcessor } from '@repo/bullmq';
import { subjectRegenConfig } from '@repo/bullmq/config/subject-regen-config';
import {
  markSubjectRegenFinished,
  markSubjectRegenProcessing,
} from '@repo/bullmq/subject-regen-state';
import { calculateImageCredits } from '@repo/credits-calculator';
import { decodeId } from '@repo/id-gen/utils';
import { childLogger } from '@repo/logger';
import { projectCost, subjectImages, balanceTransaction } from '@repo/drizzle/schema';
import { and, eq, sql } from 'drizzle-orm';
import { publishUserEvent, remHashFromRedis } from '@repo/redis';
import { BUCKET, s3GetSignedUrl, s3Upload } from '@repo/s3';
import { s3ObjectKeyFromUrl } from '@repo/s3/object-key';
import { randomBytes } from 'crypto';
import { inTransaction } from '../../../utils/db';
import { workerApi } from '../../../utils/worker-api';

export const regenSubjectImage: InferJobProcessor<
  typeof subjectRegenConfig,
  'regen_subject_image'
> = async (job) => {
  const data = job.data;
  const taskId = job.id ?? 'unknown';
  const logger = childLogger({
    module: subjectRegenConfig.queueName,
    jobId: taskId,
    jobName: job.name,
    projectId: data.projectId,
    reflixId: data.reflixId,
    subjectId: data.subjectId,
    subjectDbId: data.subjectDbId,
  });

  const stateInput = {
    userId: data.userId,
    reflixId: data.reflixId,
    subjectDbId: data.subjectDbId,
    taskId,
  };

  await markSubjectRegenProcessing(stateInput);
  await publishProgressBestEffort(data.userId, data.reflixId, taskId, 'PROCESSING', logger);

  try {
    logger.info('Generating async subject image');
    const res = await workerApi.reflix.generateSubject({
      reflixId: data.reflixId,
      model: data.model,
      aspectRatio: data.aspectRatio,
      prompt: data.imagePrompt,
      ...(data.referenceImageUrls?.length
        ? { imageUrls: data.referenceImageUrls }
        : { imageUrl: data.referenceImageUrl }),
    });

    const key = `reflix/image/${randomHex32()}.jpg`;
    await s3Upload({
      bucket: BUCKET.FILES,
      key,
      source: res.url,
      acl: 'public-read',
      contentType: 'image/jpeg',
      downloadBehavior: 'play-in-browser',
      fileName: 'image.jpg',
    });

    const url = await s3GetSignedUrl({
      key,
      bucket: BUCKET.FILES,
    });

    const previewWithNameUrl = await workerApi.reflix.paintSubjectName({
      url,
      subjectId: data.subjectId,
      text: data.displayName,
    });
    const keyWithName = s3ObjectKeyFromUrl({
      value: previewWithNameUrl,
      bucketName: process.env.S3_BUCKET_FILES_NAME!,
      publicBaseUrl: process.env.FILES_PUBLIC_BASE_URL,
    });

    const costs: (typeof projectCost.$inferInsert)[] = res.usages.map((usage) => ({
      agentName: usage.agent_name,
      modelName: usage.model_name,
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      cost: usage.cost,
      projectId: decodeId(data.projectId),
    }));

    const totalCredits = calcCreditsByWorkerUsage(res.usages);

    await inTransaction(async (tx) => {
      if (costs.length > 0) {
        await tx.insert(projectCost).values(costs);
      }

      const subjectDbId = decodeId(data.subjectDbId);
      await tx.execute(sql`SELECT id FROM reflix_subjects WHERE id = ${subjectDbId} FOR UPDATE`);
      await tx
        .update(subjectImages)
        .set({ isCurrent: false })
        .where(
          and(
            eq(subjectImages.subjectId, subjectDbId),
            eq(subjectImages.userId, data.userId),
            eq(subjectImages.isCurrent, true),
          ),
        );

      await tx.insert(subjectImages).values({
        subjectId: subjectDbId,
        userId: data.userId,
        reflixId: decodeId(data.reflixId),
        bucket: 'reela-files',
        key,
        keyWithName,
        imagePrompt: data.imagePrompt,
        imageModel: data.model,
        source: 'regenerated',
        isCurrent: true,
      });
      if (totalCredits > 0) {
        await tx.insert(balanceTransaction).values({
          userId: data.userId,
          type: 1,
          action: 'consume',
          amount: totalCredits,
          referId: decodeId(data.projectId),
          referType: 'projects',
          reference: {
            source: 'reflix_regen_async',
            type: 'images',
            reflixId: data.reflixId,
            subjectId: data.subjectId,
            subjectDbId: data.subjectDbId,
            imageModel: data.model,
          },
        });
      }
    });

    try {
      await clearReflixSubjectWarning(data.reflixId, data.subjectDbId);
    } catch (err) {
      logger.warn(
        { err },
        'Failed to clear reflix subject warning after subject image regeneration',
      );
    }

    await markSubjectRegenFinished({ ...stateInput, status: 'completed' });
    await publishProgressBestEffort(data.userId, data.reflixId, taskId, 'COMPLETED', logger);
  } catch (err) {
    logger.error({ err }, 'Async subject image generation failed');
    await markSubjectRegenFinished({ ...stateInput, status: 'failed' });
    await publishProgressBestEffort(data.userId, data.reflixId, taskId, 'FAILED', logger);
    throw err;
  }
};

async function publishProgressBestEffort(
  userId: number,
  reflixId: string,
  jobId: string,
  state: 'PROCESSING' | 'COMPLETED' | 'FAILED',
  logger: ReturnType<typeof childLogger>,
): Promise<void> {
  try {
    await publishUserEvent(String(userId), {
      schemaVersion: '1',
      eventId: `reflix:${reflixId}:subject-generation:${jobId}:${state.toLowerCase()}`,
      type: 'reflix.progress',
      resourceType: 'reflix',
      resourceId: reflixId,
      occurredAt: new Date().toISOString(),
      payload: { state: `SUBJECT_GENERATION:${state}`, jobId },
    });
  } catch (err) {
    logger.error({ err, eventState: state }, 'Failed to publish user event');
  }
}

function clearReflixSubjectWarning(reflixId: string, subjectDbId: string): Promise<void> {
  return remHashFromRedis(`reflix:subject_warnings:${reflixId}`, [subjectDbId]);
}

function calcCreditsByWorkerUsage(usages: Array<{ model_name: string }>) {
  const usageMap = new Map<string, number>();
  for (const usage of usages) {
    usageMap.set(usage.model_name, (usageMap.get(usage.model_name) ?? 0) + 1);
  }

  let total = 0;
  for (const [model, num] of usageMap) {
    total += calculateImageCredits({ model, num });
  }
  return total;
}

function randomHex32() {
  return randomBytes(16).toString('hex');
}
