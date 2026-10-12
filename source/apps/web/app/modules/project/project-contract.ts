import { writeResultSchema } from '~/lib/api/api-request';
import z from 'zod';
import { numberFromForm } from '~/lib/api/form-fields';
import { VIDEO_ASPECT_RATIO } from '@repo/constants/video-aspect-ratio';
import {
  MIN_TASK_DURATION_SECONDS,
  MAX_TASK_DURATION_SECONDS,
} from '@repo/constants/task-duration';
import { subjectVoiceTargetSchema } from './subject-voice-target';
const MAX_SCRIPT_FILE_SIZE_BYTES = 2 * 1024 * 1024;
const imageModelSchema = z.preprocess(
  (value) => (value === 'nano-banana-2' ? 'nano-banana' : value),
  z.enum(['nano-banana', 'nano-banana-pro', 'z-image', 'seedream', 'wan', 'gpt-image-2']),
);
const referenceImageSchema = z.union([
  z.file().mime(['image/jpeg', 'image/png']).min(1).max(2 * 1024 * 1024),
  z.string(),
]);
export const addSubjectSchema = z.object({
  reflixId: z.string(),
  name: z.string().trim().min(1).max(100),
  category: z.string().min(1),
  mode: z.enum(['upload', 'generate']).default('upload'),
  image: z.file().min(1).mime(['image/png', 'image/jpeg']).optional(),
  imagePrompt: z.string().optional(),
  parentImage: referenceImageSchema.optional(),
  referenceImages: z.array(referenceImageSchema).optional(),
  model: imageModelSchema.default('gpt-image-2'),
  imageWidth: numberFromForm(z.number().positive()).default(1600),
  imageHeight: numberFromForm(z.number().positive()).default(900),
}).superRefine((data, ctx) => {
  if (data.mode === 'upload' && !data.image) ctx.addIssue({ code: 'custom', path: ['image'], message: 'Image required' });
  if (data.mode === 'generate' && !data.imagePrompt?.trim()) ctx.addIssue({ code: 'custom', path: ['imagePrompt'], message: 'Prompt required' });
  if ((data.parentImage || data.referenceImages?.length) && ['z-image', 'wan'].includes(data.model)) ctx.addIssue({ code: 'custom', path: ['model'], message: 'Model does not support reference images' });
});

export const bindVoiceSchema = subjectVoiceTargetSchema.extend({
  voiceDbId: z.string(),
});

export const cloneProjectSchema = z.object({
  id: z.string(),
});

export const cloneVoiceSchema = subjectVoiceTargetSchema.extend({
  file: z.instanceof(File),
  voiceName: z.string().min(1),
  reflixId: z.string(),
});

export const continueReflixSchema = z.object({ id: z.string() });

export const createProjectTaskSchema = z.object({
  id: z.string(),
  episodes: z.string().array().min(1),
  offpeak: z.boolean().optional().default(false),
});

export const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  kind: z.enum(['reflix']).default('reflix'),
});

export const createReflixProjectSchema = z.object({
  scriptFile: z.file().mime(['text/plain']).min(1).max(MAX_SCRIPT_FILE_SIZE_BYTES).optional(),
  scriptFileKey: z.string().optional(),
  scriptFileName: z.string().optional(),

  name: z.string().optional(),
  description: z.string().optional(),

  visualStyleKey: z.string().optional(),
  visualStyle: z.string().optional(),
  episodeRequirements: z.string().optional(),

  imageModel: imageModelSchema.default('gpt-image-2'),
  adaptationMode: z.enum(['duration_first', 'source_locked']).default('duration_first'),

  // video settings
  totalCount: numberFromForm(z.number().min(1).max(100)),
  episodeDuration: numberFromForm(z.number().min(1).max(600)),
  languageCode: z.string().trim().min(1).default('en-US'),
  showTemplateKey: z.string().optional(),
  promptTemplate: z.string(),
  layout: z.enum(VIDEO_ASPECT_RATIO).default('16_9'),
  tier: z.string().optional(),
  pauseForScriptReview: z.preprocess(
    (value) => (value === 'true' ? true : value === 'false' ? false : value),
    z.boolean().default(true),
  ),
});

export const deleteProjectSchema = z.object({
  id: z.string(),
});

export const deleteReflixProjectSchema = z.object({
  id: z.string(),
});

export const generateVoiceDesignSchema = z.object({
  prompt: z.string().min(1),
  previewText: z.string().min(1),
});

export const importSubjectsSchema = z.object({
  targetReflixId: z.string(),
  sourceSubjectIds: z.array(z.string()).min(1).max(100),
});

export const packVideosSchema = z.object({
  taskIds: z.array(z.string()).min(1),
});

export const pauseReflixSchema = z.object({ id: z.string() });

export const regenSubjectSchema = z.object({
  projectId: z.string(),
  subjectDbId: z.string().optional(),
  subjectId: z.string(),
  displayName: z.string(),
  imagePrompt: z.string(),
  parentImage: referenceImageSchema.optional(),
  referenceImages: z.array(referenceImageSchema).optional(),
  model: imageModelSchema,
  imageWidth: numberFromForm(z.number().positive()),
  imageHeight: numberFromForm(z.number().positive()),
}).superRefine((data, ctx) => {
  if ((data.parentImage || data.referenceImages?.length) && ['z-image', 'wan'].includes(data.model)) ctx.addIssue({ code: 'custom', path: ['model'], message: 'Model does not support reference images' });
});

export const retryProjectSchema = z.object({
  id: z.string(),
});

export const saveDesignedVoiceSchema = subjectVoiceTargetSchema.extend({
  voiceId: z.string(),
  voiceName: z.string().min(1),
  prompt: z.string(),
  previewText: z.string(),
  previewUrl: z.string(),
  reflixId: z.string(),
});

export const switchSubjectImageSchema = z.object({
  subjectId: z.string(),
  imageId: numberFromForm(z.number().int().positive()),
});

export const updateEpisodeSchema = z.object({
  episodeId: z.string(),
  script: z.string().optional(),
  title: z.string().optional(),
  duration: numberFromForm(z.number()).optional(),
  episodeNumber: numberFromForm(z.number()).optional(),
  subjects: z.string().optional(),
});

export const updateProjectSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

export const updateReflixProjectSchema = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    layout: z.enum(VIDEO_ASPECT_RATIO).optional(),
    tier: z.string().optional(),
    languageCode: z.string().optional(),
    visualStyleKey: z.string().optional(),
    visualStyle: z.string().optional(),
    episodeRequirements: z.string().optional(),
    showTemplateKey: z.string().optional(),
    promptTemplate: z.string().optional(),
    adaptationMode: z.enum(['duration_first', 'source_locked']).optional(),
    episodeDuration: numberFromForm(
      z.number().int().min(MIN_TASK_DURATION_SECONDS).max(MAX_TASK_DURATION_SECONDS),
    ).optional(),
    pauseForScriptReview: z.preprocess(
      (value) => (value === 'true' ? true : value === 'false' ? false : value),
      z.boolean().optional(),
    ),
  })
  .superRefine((data, ctx) => {
    if (data.adaptationMode === 'duration_first' && data.episodeDuration === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['episodeDuration'],
        message: 'Duration is required in duration-first mode',
      });
    }
  });

export const updateSubjectSchema = z.object({
  subjectId: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  image: z.union([z.file().mime(['image/jpeg', 'image/png']).min(1), z.url()]).optional(),
  imagePrompt: z.string().optional(),
  source: z.enum(['uploaded', 'regenerated']).optional(),
  imageKey: z.string().optional(),
  imageKeyWithName: z.string().optional(),
});

export const unbindVoiceSchema = subjectVoiceTargetSchema;

export const messageSchema = z.object({ message: z.string() });
export const addSubjectResultSchema = messageSchema.extend({
  subjectId: z.string().optional(),
  generationError: z.string().optional(),
});
export const projectSchema = z.object({
  projectId: z.string().min(1),
  kind: z.string().optional(),
});
export const statusSchema = z.object({ status: z.number(), jobId: z.string().optional() });
export const packSchema = z.object({ jobId: z.string().min(1) });
export const voiceSchema = z.object({
  voices: z.array(z.object({ voiceId: z.string().min(1), previewUrl: z.string().min(1) })),
});
export const generationSchema = z.object({
  taskId: z.string().min(1),
  subjectId: z.string().min(1),
  status: z.literal('queued'),
  message: z.string(),
});
export const importSchema = messageSchema.extend({
  importedCount: z.number(),
  skippedCount: z.number(),
});

export type ProjectResult =
  | z.infer<typeof addSubjectResultSchema>
  | z.infer<typeof messageSchema>
  | z.infer<typeof projectSchema>
  | z.infer<typeof statusSchema>
  | z.infer<typeof packSchema>
  | z.infer<typeof voiceSchema>
  | z.infer<typeof generationSchema>
  | z.infer<typeof importSchema>
  | z.infer<typeof writeResultSchema>;
