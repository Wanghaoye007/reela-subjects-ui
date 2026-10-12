import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './editor-layout-choices.css';

const choices = [
  { id: 'compact', label: 'A 紧凑侧栏', description: '参考图一行，模型与操作共用底栏；图片占 58%。' },
  { id: 'prompt', label: 'B 提示词优先', description: '提示词在前，参考图作为下方附件；编辑区占 52%。' },
  { id: 'toolbar', label: 'C 横向工具栏', description: '参考图与模型同一顶栏，长提示词铺满编辑区；编辑区占 56%。' },
] as const;

/** The comparison controls belong only to the local preview, never to the production UI. */
export function EditorLayoutChoices() {
  const params = new URLSearchParams(location.search);
  const enabled = params.get('layouts') === '1';
  const [layout, setLayout] = useState(() => choices.some(x => x.id === params.get('layout')) ? params.get('layout')! : 'compact');
  const [header, setHeader] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!enabled) return;
    document.documentElement.dataset.editorLayout = layout;
    const url = new URL(location.href);
    url.searchParams.set('layout', layout);
    history.replaceState(history.state, '', url);
    return () => { delete document.documentElement.dataset.editorLayout; };
  }, [enabled, layout]);
  useEffect(() => {
    if (!enabled) return;
    const update = () => setHeader(document.querySelector('.subject-image-dialog > [data-slot="dialog-header"]'));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [enabled]);
  if (!enabled || !header) return null;
  return createPortal(
    <div className='editor-layout-choices' role='group' aria-label='对比排版方案'>
      {choices.map(choice => <button key={choice.id} type='button'
        aria-pressed={layout === choice.id} title={choice.description}
        onClick={() => setLayout(choice.id)}>{choice.label}</button>)}
    </div>, header,
  );
}
