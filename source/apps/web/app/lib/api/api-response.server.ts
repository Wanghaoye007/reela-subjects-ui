import { childLogger } from '@repo/logger';
import { href, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import { getRequestContext } from '~/middleware/request-context.server';
import { ApiError } from './api-error.server';

export function methodNotAllowed(allow = 'POST') {
  return Response.json(
    { message: 'Method not allowed' },
    { status: 405, headers: { Allow: allow } },
  );
}

export async function apiResponse(
  args: ActionFunctionArgs,
  operation: () => Promise<unknown>,
  {
    method = 'POST',
    status = 200,
    admin = false,
  }: { method?: 'GET' | 'POST'; status?: number; admin?: boolean } = {},
) {
  if (args.request.method !== method) return methodNotAllowed(method);
  const { userId, session, requestId } = getRequestContext(args.context);
  const headers = { 'Cache-Control': 'no-store' };
  if (!userId) {
    return Response.json(
      { message: 'Unauthorized', redirect: href('/login') },
      { status: 401, headers },
    );
  }
  if (admin && !session?.isAdmin) {
    return Response.json({ message: 'Forbidden' }, { status: 403, headers });
  }
  try {
    return Response.json(await operation(), { status, headers });
  } catch (error) {
    childLogger({ reqId: requestId }).error({ err: error }, 'API request failed');
    if (error instanceof ApiError) {
      return Response.json(
        { message: error.userMessage, redirect: error.redirect },
        { status: error.status, headers },
      );
    }
    if (error instanceof z.ZodError) {
      return Response.json({ message: 'Invalid data' }, { status: 400, headers });
    }
    return Response.json({ message: 'Unknown error' }, { status: 500, headers });
  }
}

export async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.includes('application/json')) {
    throw new ApiError({ userMessage: 'Expected JSON', status: 415 });
  }
  try {
    return await request.json();
  } catch {
    throw new ApiError({ userMessage: 'Invalid JSON', status: 400 });
  }
}

export async function readMultipartOrJson(request: Request, arrayFields: readonly string[] = []): Promise<unknown> {
  if (!request.headers.get('content-type')?.includes('multipart/form-data'))
    return readJson(request);
  try {
    const form = await request.formData();
    const input: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};
    for (const [key, value] of form) {
      if (arrayFields.includes(key)) {
        if (!Object.hasOwn(input, key)) Object.defineProperty(input, key, { value: [], enumerable: true });
        (input[key] as FormDataEntryValue[]).push(value);
        continue;
      }
      if (Object.hasOwn(input, key)) throw new Error('Duplicate field');
      Object.defineProperty(input, key, { value, enumerable: true });
    }
    return input;
  } catch {
    throw new ApiError({ userMessage: 'Invalid form data', status: 400 });
  }
}
