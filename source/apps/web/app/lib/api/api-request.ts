import { href } from 'react-router';
import { z } from 'zod';

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly redirect?: string,
  ) {
    super(message);
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await fetch(path, options);
  if (response.redirected) {
    const url = new URL(response.url);
    throw new ApiRequestError(
      'Request redirected',
      401,
      url.pathname === href('/login') ? href('/login') : undefined,
    );
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = z
      .object({ message: z.string(), redirect: z.string().optional() })
      .safeParse(body);
    throw new ApiRequestError(
      error.success ? error.data.message : `Request failed (${response.status})`,
      response.status,
      error.success ? error.data.redirect : undefined,
    );
  }
  const result = schema.safeParse(body);
  if (!result.success) throw new ApiRequestError('Invalid API response', response.status);
  return result.data;
}

export function jsonBody(input: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  };
}

export const writeResultSchema = z.object({ ok: z.literal(true) });

export function multipartBody(input: FormData | Record<string, unknown>): RequestInit {
  if (input instanceof FormData) return { method: 'POST', body: input };
  if (!Object.values(input).some(value => value instanceof Blob || (Array.isArray(value) && value.some(item => item instanceof Blob)))) return jsonBody(input);
  const body = new FormData();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (!(item instanceof Blob) && typeof item !== 'string') throw new Error(`Unsupported multipart field: ${key}`);
        body.append(key, item);
      }
    } else if (value instanceof Blob || typeof value === 'string') body.append(key, value);
    else if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))
      body.append(key, JSON.stringify(value));
    else throw new Error(`Unsupported multipart field: ${key}`);
  }
  return { method: 'POST', body };
}
