import fixture from './fixture.json';
const storageKey = 'reela-public-real-preview-v2';
export function installLocalApi() {
  const originalFetch = window.fetch.bind(window);
  let subjects = structuredClone(fixture.subjects);
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) subjects = JSON.parse(saved);
  } catch {}
  const reply = (body: unknown, status = 200) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  window.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    const method = (
      init?.method || (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();
    if (url.origin !== location.origin) {
      if (method !== 'GET') return reply({ message: '本地预览禁止外部写入' }, 403);
      return originalFetch(input, init);
    }
    if (!url.pathname.startsWith('/api/')) return originalFetch(input, init);
    if (method === 'GET') {
      if (url.pathname.endsWith('/summary')) return reply(fixture.summary);
      if (url.pathname.endsWith('/subjects')) return reply(subjects);
      if (url.pathname === '/api/project-voices') return reply({ voices: subjects.voices });
      return reply({ message: '该接口未接入本地素材页预览' }, 501);
    }
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    if (url.pathname === '/api/projects/subjects/switch-image') {
      const target = subjects.subjects.find((s) => s.id === body.subjectId);
      const selected = target?.images.find((i) => i.id === body.imageId);
      if (!target || !selected) return reply({ message: '图片不存在' }, 400);
      subjects.subjects = subjects.subjects.map((s) =>
        s.id === target.id
          ? {
              ...s,
              previewUrl: selected.url,
              previewWithNameUrl: selected.urlWithName,
              imagePrompt: selected.imagePrompt ?? s.imagePrompt,
              images: s.images.map((i) => ({ ...i, isCurrent: i.id === selected.id })),
            }
          : s,
      );
      localStorage.setItem(storageKey, JSON.stringify(subjects));
      return reply({ message: '图片已保存至本地副本' });
    }
    if (/\/voices\/(bind|unbind)$/.test(url.pathname)) {
      const target = subjects.subjects.find((s) => s.id === body.subjectId);
      const voice = subjects.voices.find((v) => v.id === body.voiceDbId);
      if (!target || (url.pathname.endsWith('/bind') && !voice))
        return reply({ message: '素材或声音不存在' }, 400);
      const ids = new Set([body.subjectId]);
      if (body.scope === 'subtree') {
        for (let i = 0; i < subjects.subjects.length; i++)
          for (const s of subjects.subjects) if (s.parentId && ids.has(s.parentId)) ids.add(s.id);
      }
      subjects.subjects = subjects.subjects.map((s) =>
        ids.has(s.id)
          ? { ...s, voice: voice ? { platform: voice.platform, voiceId: voice.voiceId } : null }
          : s,
      );
      localStorage.setItem(storageKey, JSON.stringify(subjects));
      return reply({ message: '已保存至本地副本' });
    }
    return reply({ message: '此操作需要生产服务，本地预览未执行' }, 501);
  };
}
