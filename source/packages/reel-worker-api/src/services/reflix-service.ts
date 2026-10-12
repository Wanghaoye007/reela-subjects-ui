import type { HttpRequest } from '../types/http-request';
import type {
  OmniShowDirectGenerationRequest,
  OmniShowGenerationAcceptance,
  OmniShowSubjectGenerationBatchAcceptance,
  OmniShowSubjectGenerationBatchRequest,
} from '../types/omni-show';
import type { WorkerUsage } from '../types/worker-usage';

function normalizeReflixImageModel(model: unknown) {
  return model === 'nano-banana-2' ? 'nano-banana' : model;
}

export class ReflixService {
  constructor(private readonly request: HttpRequest) {}

  async generateOmniShowSubjects(
    input: OmniShowSubjectGenerationBatchRequest,
  ): Promise<OmniShowSubjectGenerationBatchAcceptance> {
    const requestedIds = input.subjects.map((subject) => subject.subjectRequestId);
    if (requestedIds.length === 0 || new Set(requestedIds).size !== requestedIds.length) {
      throw new Error('Omni Show Subject batch must contain unique requests');
    }

    const data = await this.request('/reflix/subject/generate', {
      method: 'POST',
      body: JSON.stringify(input),
    });

    const acceptedIds = (data as { subjectRequestIds?: unknown })?.subjectRequestIds;
    if (
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data) ||
      'schemaVersion' in data ||
      (data as { status?: unknown }).status !== 'accepted' ||
      !Array.isArray(acceptedIds) ||
      acceptedIds.some((id) => typeof id !== 'string') ||
      new Set(requestedIds).size !== requestedIds.length ||
      new Set(acceptedIds).size !== acceptedIds.length ||
      requestedIds.length !== acceptedIds.length ||
      requestedIds.some((id) => !acceptedIds.includes(id))
    ) {
      throw new Error('Omni Show Subject batch acceptance did not match the request');
    }

    return {
      status: 'accepted',
      subjectRequestIds: [...acceptedIds],
    };
  }

  async generateOmniShow(
    input: OmniShowDirectGenerationRequest,
  ): Promise<OmniShowGenerationAcceptance> {
    const data = await this.request('/reflix/omni-show/generate', {
      method: 'POST',
      body: JSON.stringify(input),
    });

    if (
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data) ||
      (data as { status?: unknown }).status !== 'processing' ||
      (data as { generationRunId?: unknown }).generationRunId !== input.generationRunId
    ) {
      throw new Error('Omni Show generation acceptance did not match the request');
    }

    return data as OmniShowGenerationAcceptance;
  }

  async generateAllSubjects(input: {
    reqId: string;
    input: {
      imageModel:
        | 'nano-banana'
        | 'nano-banana-pro'
        | 'z-image'
        | 'seedream'
        | 'wan'
        | 'gpt-image-2';
      SHOW_BIBLE?: string;
      EPISODES_SCRIPT?: string;
      VISUAL_REQUIREMENTS?: string;
      PROJECT_REQUIREMENTS?: string;
      VISUAL_STYLE?: string;
      VIDEO_REQUIREMENTS?: string;
      SERIES_STRATEGY?: string;
      NAMING_CANON?: Array<{
        name: string;
        type: 'character' | 'place' | 'institution' | 'prop';
        aliases: string[];
        sourceNames: string[];
      }>;
      ESTABLISHED_VISUAL_ASSETS?: string;
      LANGUAGE_CODE?: string;
    };
  }) {
    const PATH = '/reflix/subject/generate';

    input.input.imageModel = normalizeReflixImageModel(
      input.input.imageModel,
    ) as typeof input.input.imageModel;
    if (!input.input.imageModel) {
      input.input.imageModel = 'z-image';
    }

    const data = await this.request(PATH, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return data as {
      status: 'processing';
    };
  }

  async generateSubject(input: {
    reflixId: string;
    model: 'nano-banana' | 'nano-banana-pro' | 'z-image' | 'seedream' | 'wan' | 'gpt-image-2';
    aspectRatio: '4:3' | '3:4' | '16:9' | '9:16' | '1:1';
    prompt: string;
    imageUrl?: string;
    imageUrls?: string[];
  }) {
    const PATH = '/reflix/subject/paint';

    input.model = normalizeReflixImageModel(input.model) as typeof input.model;
    if (!input.imageUrl) {
      delete input.imageUrl;
    }

    const data = await this.request(PATH, {
      method: 'POST',
      body: JSON.stringify(input),
    });

    return data as {
      url: string;
      error: unknown;
      usages: Array<WorkerUsage>;
    };
  }

  async paintSubjectName(input: { url: string; text?: string; subjectId?: string }) {
    const PATH = '/reflix/image';
    const METHOD = 'POST';

    const { text, subjectId, url } = input;
    if (!text && !subjectId) {
      throw new Error('text or subjectId is required');
    }

    const content = text || this.convertSubjectIdToName(subjectId!);

    const data = await this.request(PATH, {
      method: METHOD,
      body: JSON.stringify({
        url: url,
        text: content,
      }),
    });
    return data as string;
  }

  convertSubjectIdToName(subjectId: string) {
    const arr = subjectId.split(':')[1]?.split('__');
    const name = arr?.[0]?.replace(/_/g, ' ');
    const scene = arr?.[1]?.replace(/_/g, ' ');
    return scene ? `${name} (${scene})` : name;
  }
}
