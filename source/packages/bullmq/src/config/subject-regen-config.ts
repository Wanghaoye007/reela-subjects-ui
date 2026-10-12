import z from 'zod';
import type { BullMQConfig } from '../types/bullmq-config';

const imageModelSchema = z.preprocess(
  (value) => (value === 'nano-banana-2' ? 'nano-banana' : value),
  z.enum(['nano-banana', 'nano-banana-pro', 'z-image', 'seedream', 'wan', 'gpt-image-2']),
);

export const subjectRegenConfig = {
  queueName: 'subject_regen',
  queueJobs: [
    {
      name: 'regen_subject_image',
      inputSchema: z.object({
        userId: z.number(),
        projectId: z.string(),
        reflixId: z.string(),
        subjectDbId: z.string(),
        subjectId: z.string(),
        displayName: z.string(),
        imagePrompt: z.string(),
        model: imageModelSchema,
        aspectRatio: z.enum(['16:9', '4:3', '3:4', '9:16', '1:1']),
        referenceImageUrl: z.string().optional(),
        referenceImageUrls: z.array(z.string()).optional(),
      }),
      outputSchema: z.void(),
    },
  ],
  workerOptions: {
    concurrency: 50,
    maxStalledCount: 3,
    lockDuration: 60000,
  },
  queueOptions: {
    defaultJobOptions: {
      removeOnComplete: true,
      removeOnFail: {
        count: 30,
      },
    },
  },
} as const satisfies BullMQConfig;
