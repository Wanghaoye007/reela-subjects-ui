import { describe, it, expect, vi } from 'vitest';
import { ReflixService } from './reflix-service';
import type { HttpRequest } from '../types/http-request';
import type {
  OmniShowDirectGenerationRequest,
  OmniShowSubjectGenerationRequest,
} from '../types/omni-show';

function createMockRequest(data: unknown = {}): HttpRequest {
  return vi.fn().mockResolvedValue(data);
}

function getCalledBody(mockRequest: HttpRequest): Record<string, unknown> {
  const calls = (mockRequest as ReturnType<typeof vi.fn>).mock.calls;
  return JSON.parse(calls[0]![1].body as string);
}

describe('ReflixService', () => {
  describe('generateOmniShowSubjects', () => {
    const request = {
      subjectRequestId: 'omni_subject_0123456789abcdef0123456789abcdef',
      generationRunId: 'omni_0123456789abcdef0123456789abcdef',
      projectId: '9001',
      reflixId: '9002',
      subject: {
        subjectId: 'C:HERO',
        category: 'Character',
        name: 'Hero',
      },
      image: {
        model: 'nano-banana',
        aspectRatio: '4:3',
        finalPrompt: 'Authoritative compiled prompt',
        compilerVersion: 'omni-show-subject-prompt/v1',
        referenceSubjectIds: [],
        referenceImages: [],
      },
      voiceProfile: {
        designDescription: 'Warm and steady',
        previewAudioRequired: true,
      },
      outputIntent: { image: true, voiceProfile: true },
      callback: {
        url: 'https://api.example.com/api/reflix/omni-show/subject-callback',
        subjectRequestId: 'omni_subject_0123456789abcdef0123456789abcdef',
        generationRunId: 'omni_0123456789abcdef0123456789abcdef',
        projectId: '9001',
        reflixId: '9002',
        subjectId: 'C:HERO',
      },
    } satisfies OmniShowSubjectGenerationRequest;

    const secondRequest = {
      ...request,
      subjectRequestId: 'omni_subject_ffffffffffffffffffffffffffffffff',
      subject: {
        ...request.subject,
        subjectId: 'C:ALLY',
        name: 'Ally',
      },
      callback: {
        ...request.callback,
        subjectRequestId: 'omni_subject_ffffffffffffffffffffffffffffffff',
        subjectId: 'C:ALLY',
      },
    } satisfies OmniShowSubjectGenerationRequest;

    it('posts one authoritative batch to the shared Subject generation path', async () => {
      const response = {
        status: 'accepted' as const,
        subjectRequestIds: [request.subjectRequestId, secondRequest.subjectRequestId],
      };
      const mockRequest = createMockRequest(response);
      const service = new ReflixService(mockRequest);

      await expect(
        service.generateOmniShowSubjects({
          subjects: [request, secondRequest],
        }),
      ).resolves.toEqual(response);
      expect(mockRequest).toHaveBeenCalledWith('/reflix/subject/generate', {
        method: 'POST',
        body: JSON.stringify({
          subjects: [request, secondRequest],
        }),
      });
    });

    it('rejects durable acceptance with a different Subject request set', async () => {
      const service = new ReflixService(
        createMockRequest({
          status: 'accepted',
          subjectRequestIds: [request.subjectRequestId],
        }),
      );

      await expect(
        service.generateOmniShowSubjects({
          subjects: [request, secondRequest],
        }),
      ).rejects.toThrow('Omni Show Subject batch acceptance did not match the request');
    });

    it('rejects an acceptance containing the retired schemaVersion field', async () => {
      const service = new ReflixService(
        createMockRequest({
          schemaVersion: 'omni-show-subject-generation-batch-acceptance/v1',
          status: 'accepted',
          subjectRequestIds: [request.subjectRequestId],
        }),
      );

      await expect(service.generateOmniShowSubjects({ subjects: [request] })).rejects.toThrow(
        'Omni Show Subject batch acceptance did not match the request',
      );
    });

    it('rejects malformed durable acceptance', async () => {
      const service = new ReflixService(
        createMockRequest({
          status: 'processing',
          subjectRequestIds: [request.subjectRequestId],
        }),
      );

      await expect(
        service.generateOmniShowSubjects({
          subjects: [request],
        }),
      ).rejects.toThrow('Omni Show Subject batch acceptance did not match the request');
    });

    it('rejects an empty batch before calling reel-worker', async () => {
      const mockRequest = createMockRequest();
      const service = new ReflixService(mockRequest);

      await expect(
        service.generateOmniShowSubjects({
          subjects: [],
        }),
      ).rejects.toThrow('Omni Show Subject batch must contain unique requests');
      expect(mockRequest).not.toHaveBeenCalled();
    });
  });

  describe('generateOmniShow', () => {
    const request = {
      schemaVersion: 'omni-show-direct-generation/v1' as const,
      generationRunId: `omni_${'b'.repeat(32)}`,
      projectId: '9001',
      reflixId: '9002',
      documentVersion: `v1:${'a'.repeat(64)}` as `v1:${string}`,
      imageModel: 'nano-banana' as const,
      languageCode: 'en-US',
      globalVisualSettings: {
        artDirection: null,
        constraints: [],
        visualRequirements: null,
      },
      promptContext: {
        projectRequirements: null,
        visualStyle: null,
        videoRequirements: null,
        seriesStrategy: null,
      },
      establishedVisualAssets: '',
      callback: {
        url: 'https://api.example.com/api/reflix/omni-show/callback',
        generationRunId: `omni_${'b'.repeat(32)}`,
        projectId: '9001',
        reflixId: '9002',
        documentVersion: `v1:${'a'.repeat(64)}` as `v1:${string}`,
      },
      subjects: [],
    } satisfies OmniShowDirectGenerationRequest;

    it('posts the authoritative request to the direct-generation endpoint', async () => {
      const response = {
        status: 'processing' as const,
        generationRunId: request.generationRunId,
      };
      const mockRequest = createMockRequest(response);
      const service = new ReflixService(mockRequest);

      await expect(service.generateOmniShow(request)).resolves.toEqual(response);
      expect(mockRequest).toHaveBeenCalledWith('/reflix/omni-show/generate', {
        method: 'POST',
        body: JSON.stringify(request),
      });
    });

    it('rejects an acceptance response for another generation run', async () => {
      const mockRequest = createMockRequest({
        status: 'processing',
        generationRunId: `omni_${'c'.repeat(32)}`,
      });
      const service = new ReflixService(mockRequest);

      await expect(service.generateOmniShow(request)).rejects.toThrow(
        'Omni Show generation acceptance did not match the request',
      );
    });

    it('rejects malformed acceptance data', async () => {
      const service = new ReflixService(createMockRequest({ status: 'accepted' }));

      await expect(service.generateOmniShow(request)).rejects.toThrow(
        'Omni Show generation acceptance did not match the request',
      );
    });
  });

  describe('generateAllSubjects', () => {
    it('should POST to /reflix/subject/generate with the input', async () => {
      const mockRequest = createMockRequest({ status: 'processing' });
      const service = new ReflixService(mockRequest);

      const input = {
        reqId: 'req-1',
        input: {
          imageModel: 'gpt-image-2' as const,
          SHOW_BIBLE: 'bible content',
          VIDEO_REQUIREMENTS: 'gold-rim glasses and left cheek scar',
          SERIES_STRATEGY: 'series strategy',
          NAMING_CANON: [
            {
              name: 'Bailey',
              type: 'character',
              aliases: [],
              sourceNames: ['Belly'],
            },
          ],
        },
      } satisfies Parameters<ReflixService['generateAllSubjects']>[0];

      const result = await service.generateAllSubjects(input);

      expect(mockRequest).toHaveBeenCalledWith('/reflix/subject/generate', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      expect(result).toEqual({ status: 'processing' });
    });

    it('normalizes legacy nano-banana-2 imageModel to downstream nano-banana key', async () => {
      const mockRequest = createMockRequest({ status: 'processing' });
      const service = new ReflixService(mockRequest);

      await service.generateAllSubjects({
        reqId: 'req-legacy',
        input: {
          imageModel: 'nano-banana-2' as any,
        },
      });

      const calledBody = getCalledBody(mockRequest);
      expect((calledBody.input as Record<string, unknown>).imageModel).toBe('nano-banana');
    });

    it('should default imageModel to z-image when falsy', async () => {
      const mockRequest = createMockRequest({ status: 'processing' });
      const service = new ReflixService(mockRequest);

      const input = {
        reqId: 'req-2',
        input: {
          imageModel: '' as any,
        },
      };

      await service.generateAllSubjects(input);

      // The input is mutated before sending
      const calledBody = getCalledBody(mockRequest);
      expect((calledBody.input as Record<string, unknown>).imageModel).toBe('z-image');
    });
  });

  describe('generateSubject', () => {
    it('should POST to /reflix/subject/paint with the input including reflixId', async () => {
      const responseData = {
        url: 'https://example.com/image.png',
        error: null,
        usages: [],
      };
      const mockRequest = createMockRequest(responseData);
      const service = new ReflixService(mockRequest);

      const input = {
        reflixId: 'rflx_abc123',
        model: 'gpt-image-2' as const,
        aspectRatio: '16:9' as const,
        prompt: 'a beautiful landscape',
        imageUrl: 'https://example.com/ref.png',
      };

      const result = await service.generateSubject(input);

      expect(mockRequest).toHaveBeenCalledWith('/reflix/subject/paint', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      const calledBody = getCalledBody(mockRequest);
      expect(calledBody.reflixId).toBe('rflx_abc123');
      expect(result).toEqual(responseData);
    });

    it('serializes every reference URL for the multi-reference contract', async () => {
      const mockRequest = createMockRequest({ url: '', error: null, usages: [] });
      const service = new ReflixService(mockRequest);
      const imageUrls = ['https://example.com/a.png', 'https://example.com/b.png'];
      await service.generateSubject({ reflixId: 'r1', model: 'seedream', aspectRatio: '16:9',
        prompt: 'multi reference', imageUrls });
      expect(getCalledBody(mockRequest).imageUrls).toEqual(imageUrls);
      expect(getCalledBody(mockRequest).imageUrl).toBeUndefined();
    });

    it('should remove imageUrl when falsy', async () => {
      const mockRequest = createMockRequest({ url: '', error: null, usages: [] });
      const service = new ReflixService(mockRequest);

      const input = {
        reflixId: 'rflx_abc123',
        model: 'nano-banana' as const,
        aspectRatio: '4:3' as const,
        prompt: 'test prompt',
        imageUrl: '',
      };

      await service.generateSubject(input);

      const calledBody = getCalledBody(mockRequest);
      expect(calledBody.imageUrl).toBeUndefined();
      expect(calledBody.reflixId).toBe('rflx_abc123');
    });

    it('normalizes legacy nano-banana-2 model to downstream nano-banana key', async () => {
      const mockRequest = createMockRequest({ url: '', error: null, usages: [] });
      const service = new ReflixService(mockRequest);

      await service.generateSubject({
        reflixId: 'rflx_abc123',
        model: 'nano-banana-2' as any,
        aspectRatio: '4:3',
        prompt: 'test prompt',
      });

      const calledBody = getCalledBody(mockRequest);
      expect(calledBody.model).toBe('nano-banana');
    });

    it('should keep imageUrl when provided', async () => {
      const mockRequest = createMockRequest({ url: '', error: null, usages: [] });
      const service = new ReflixService(mockRequest);

      const input = {
        reflixId: 'rflx_abc123',
        model: 'nano-banana' as const,
        aspectRatio: '4:3' as const,
        prompt: 'test prompt',
        imageUrl: 'https://example.com/ref.png',
      };

      await service.generateSubject(input);

      const calledBody = getCalledBody(mockRequest);
      expect(calledBody.imageUrl).toBe('https://example.com/ref.png');
    });
  });

  describe('paintSubjectName', () => {
    it('should POST to /reflix/image with text', async () => {
      const mockRequest = createMockRequest('result-url');
      const service = new ReflixService(mockRequest);

      const result = await service.paintSubjectName({
        url: 'https://example.com/image.png',
        text: 'John Doe',
      });

      expect(mockRequest).toHaveBeenCalledWith('/reflix/image', {
        method: 'POST',
        body: JSON.stringify({
          url: 'https://example.com/image.png',
          text: 'John Doe',
        }),
      });
      expect(result).toBe('result-url');
    });

    it('should convert subjectId to name when text is not provided', async () => {
      const mockRequest = createMockRequest('result-url');
      const service = new ReflixService(mockRequest);

      await service.paintSubjectName({
        url: 'https://example.com/image.png',
        subjectId: 'prefix:John_Doe__In_the_park',
      });

      const calledBody = getCalledBody(mockRequest);
      expect(calledBody.text).toBe('John Doe (In the park)');
    });

    it('should throw when neither text nor subjectId is provided', async () => {
      const mockRequest = createMockRequest();
      const service = new ReflixService(mockRequest);

      await expect(
        service.paintSubjectName({ url: 'https://example.com/image.png' }),
      ).rejects.toThrow('text or subjectId is required');
    });

    it('should prefer text over subjectId when both are provided', async () => {
      const mockRequest = createMockRequest('result-url');
      const service = new ReflixService(mockRequest);

      await service.paintSubjectName({
        url: 'https://example.com/image.png',
        text: 'Custom Text',
        subjectId: 'prefix:John_Doe',
      });

      const calledBody = getCalledBody(mockRequest);
      expect(calledBody.text).toBe('Custom Text');
    });
  });

  describe('convertSubjectIdToName', () => {
    it('should convert subjectId with name and scene', () => {
      const service = new ReflixService(vi.fn());
      expect(service.convertSubjectIdToName('prefix:John_Doe__In_the_park')).toBe(
        'John Doe (In the park)',
      );
    });

    it('should convert subjectId with name only', () => {
      const service = new ReflixService(vi.fn());
      expect(service.convertSubjectIdToName('prefix:Jane_Smith')).toBe('Jane Smith');
    });

    it('should return undefined when no colon present', () => {
      const service = new ReflixService(vi.fn());
      expect(service.convertSubjectIdToName('noColon')).toBeUndefined();
    });

    it('should handle empty string after colon', () => {
      const service = new ReflixService(vi.fn());
      expect(service.convertSubjectIdToName('prefix:')).toBe('');
    });

    it('should handle multiple underscores in name', () => {
      const service = new ReflixService(vi.fn());
      expect(service.convertSubjectIdToName('prefix:A_B_C__D_E')).toBe('A B C (D E)');
    });
  });
});
