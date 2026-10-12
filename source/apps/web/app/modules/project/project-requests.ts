import { z } from 'zod';
import { href } from 'react-router';
import { apiRequest, jsonBody, multipartBody, writeResultSchema } from '~/lib/api/api-request';
import type { createProjectSchema as createSchema } from '~/modules/project/project-contract';
import type { updateProjectSchema as updateSchema } from '~/modules/project/project-contract';
import type { deleteProjectSchema as deleteSchema } from '~/modules/project/project-contract';
import type { cloneProjectSchema as cloneSchema } from '~/modules/project/project-contract';
import type { retryProjectSchema as retrySchema } from '~/modules/project/project-contract';
import type { pauseReflixSchema as pauseReflixSchema } from '~/modules/project/project-contract';
import type { continueReflixSchema as continueReflixSchema } from '~/modules/project/project-contract';
import type { updateSubjectSchema as updateSubjectsSchema } from '~/modules/project/project-contract';
import type { addSubjectSchema as addSubjectsSchema } from '~/modules/project/project-contract';
import type { importSubjectsSchema as importSubjectsSchema } from '~/modules/project/project-contract';
import type { updateEpisodeSchema as updateEpisodeSchema } from '~/modules/project/project-contract';
import type { createProjectTaskSchema as createTaskSchema } from '~/modules/project/project-contract';
import type { regenSubjectSchema as regenSubjectSchema } from '~/modules/project/project-contract';
import type { createReflixProjectSchema as createReflixSchema } from '~/modules/project/project-contract';
import type { updateReflixProjectSchema as updateReflixSchema } from '~/modules/project/project-contract';
import type { deleteReflixProjectSchema as deleteReflixSchema } from '~/modules/project/project-contract';
import type { switchSubjectImageSchema as switchSubjectImageSchema } from '~/modules/project/project-contract';
import type { generateVoiceDesignSchema as generateVoiceDesignSchema } from '~/modules/project/project-contract';
import type { saveDesignedVoiceSchema as saveDesignedVoiceSchema } from '~/modules/project/project-contract';
import type { cloneVoiceSchema as cloneVoiceSchema } from '~/modules/project/project-contract';
import type { bindVoiceSchema as bindVoiceSchema } from '~/modules/project/project-contract';
import type { unbindVoiceSchema as unbindVoiceSchema } from '~/modules/project/project-contract';
import type { packVideosSchema as packVideosSchema } from '~/modules/project/project-contract';
import {
  messageSchema,
  addSubjectResultSchema,
  projectSchema,
  statusSchema,
  packSchema,
  voiceSchema,
  generationSchema,
  importSchema,
} from './project-contract';
export const createProjectRequest = (input: z.input<typeof createSchema>) =>
  apiRequest(href('/api/projects/create'), jsonBody(input), projectSchema);
export const updateProjectRequest = (input: z.input<typeof updateSchema>) =>
  apiRequest(href('/api/projects/update'), jsonBody(input), projectSchema);
export const deleteProjectRequest = (input: z.input<typeof deleteSchema>) =>
  apiRequest(href('/api/projects/delete'), jsonBody(input), writeResultSchema);
export const cloneProjectRequest = (input: z.input<typeof cloneSchema>) =>
  apiRequest(href('/api/projects/clone'), jsonBody(input), projectSchema);
export const retryProjectRequest = (input: z.input<typeof retrySchema>) =>
  apiRequest(href('/api/projects/reflix/retry'), jsonBody(input), projectSchema);
export const pauseReflixProjectRequest = (input: z.input<typeof pauseReflixSchema>) =>
  apiRequest(href('/api/projects/reflix/pause'), jsonBody(input), statusSchema);
export const continueReflixProjectRequest = (input: z.input<typeof continueReflixSchema>) =>
  apiRequest(href('/api/projects/reflix/continue'), jsonBody(input), statusSchema);
export const updateSubjectsProjectRequest = (input: z.input<typeof updateSubjectsSchema>) =>
  apiRequest(href('/api/projects/subjects/update'), multipartBody(input), messageSchema);
export const addSubjectsProjectRequest = (input: z.input<typeof addSubjectsSchema>) =>
  apiRequest(href('/api/projects/subjects/add'), multipartBody(input), addSubjectResultSchema);
export const importSubjectsProjectRequest = (input: z.input<typeof importSubjectsSchema>) =>
  apiRequest(href('/api/projects/subjects/import'), jsonBody(input), importSchema);
export const updateEpisodeProjectRequest = (
  input: z.input<typeof updateEpisodeSchema> | FormData,
) => apiRequest(href('/api/projects/episodes/update'), multipartBody(input), messageSchema);
export const createTaskProjectRequest = (input: z.input<typeof createTaskSchema>) =>
  apiRequest(href('/api/projects/episodes/create-task'), jsonBody(input), messageSchema);
export const regenSubjectProjectRequest = (input: z.input<typeof regenSubjectSchema> | FormData) =>
  apiRequest(href('/api/projects/subjects/regenerate'), multipartBody(input), generationSchema);
export const createReflixProjectRequest = (input: z.input<typeof createReflixSchema> | FormData) =>
  apiRequest(href('/api/projects/reflix/create'), multipartBody(input), projectSchema);
export const updateReflixProjectRequest = (input: z.input<typeof updateReflixSchema> | FormData) =>
  apiRequest(href('/api/projects/reflix/update'), multipartBody(input), messageSchema);
export const deleteReflixProjectRequest = (input: z.input<typeof deleteReflixSchema>) =>
  apiRequest(href('/api/projects/reflix/delete'), jsonBody(input), writeResultSchema);
export const switchSubjectImageProjectRequest = (input: z.input<typeof switchSubjectImageSchema>) =>
  apiRequest(href('/api/projects/subjects/switch-image'), jsonBody(input), messageSchema);
export const generateVoiceDesignProjectRequest = (
  input: z.input<typeof generateVoiceDesignSchema>,
) => apiRequest(href('/api/projects/voices/generate-design'), jsonBody(input), voiceSchema);
export const saveDesignedVoiceProjectRequest = (input: z.input<typeof saveDesignedVoiceSchema>) =>
  apiRequest(href('/api/projects/voices/save-design'), jsonBody(input), messageSchema);
export const cloneVoiceProjectRequest = (input: z.input<typeof cloneVoiceSchema>) =>
  apiRequest(href('/api/projects/voices/clone'), multipartBody(input), messageSchema);
export const bindVoiceProjectRequest = (input: z.input<typeof bindVoiceSchema>) =>
  apiRequest(href('/api/projects/voices/bind'), jsonBody(input), messageSchema);
export const unbindVoiceProjectRequest = (input: z.input<typeof unbindVoiceSchema>) =>
  apiRequest(href('/api/projects/voices/unbind'), jsonBody(input), messageSchema);
export const packVideosProjectRequest = (input: z.input<typeof packVideosSchema>) =>
  apiRequest(href('/api/projects/videos/pack'), jsonBody(input), packSchema);
