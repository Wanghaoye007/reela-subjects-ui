import { expect, it, vi } from 'vitest';
import { apiResponse, readMultipartOrJson } from './api-response.server';
import { createTestRouteContext } from '~/test/create-route-context';
vi.mock('@repo/logger', () => ({ childLogger: () => ({ error: vi.fn() }) }));
it('rejects a duplicated multipart field rather than silently changing its meaning', async () => {
  const form = new FormData();
  form.set('scope', 'subject');
  form.append('scope', 'subtree');
  const request = new Request('http://test', { method: 'POST', body: form });
  await expect(readMultipartOrJson(request)).rejects.toMatchObject({ status: 400 });
});
it('rejects malformed JSON and unsupported content types', async () => {
  await expect(
    readMultipartOrJson(
      new Request('http://test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
    ),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    readMultipartOrJson(new Request('http://test', { method: 'POST', body: 'text' })),
  ).rejects.toMatchObject({ status: 415 });
});
it('does not expose service exception details as a successful response', async () => {
  const response = await apiResponse(
    {
      request: new Request('http://test', { method: 'POST' }),
      context: createTestRouteContext({ userId: 42 }),
      params: {},
    } as any,
    async () => {
      throw new Error('Internal details');
    },
  );
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ message: 'Unknown error' });
});

it('preserves all declared reference fields while rejecting duplicate scalar fields', async () => {
  const form = new FormData();
  form.append('referenceImages', 'https://example.com/first.png');
  form.append('referenceImages', new File(['ref'], 'second.png', { type: 'image/png' }));
  form.set('model', 'seedream');
  const input = await readMultipartOrJson(new Request('http://test', { method: 'POST', body: form }), ['referenceImages']) as any;
  expect(input.referenceImages).toHaveLength(2);
  expect(input.referenceImages[0]).toBe('https://example.com/first.png');
  expect(input.referenceImages[1].name).toBe('second.png');
  form.append('model', 'wan');
  await expect(readMultipartOrJson(new Request('http://test', { method: 'POST', body: form }), ['referenceImages']))
    .rejects.toMatchObject({ status: 400 });
});
