import { useLayoutEffect, type ReactNode } from 'react';
import { SubjectLayoutStudyContext } from '~/components/project/subject-layout-study';
import './workbench-studies.css';
import './voice-studies.css';

/** Accepted layouts: B image results and 02 description-first voice editor. */
export function WorkbenchStudies({ children }: { children: ReactNode }) {
  const enabled = new URLSearchParams(location.search).has('study');
  useLayoutEffect(() => {
    if (!enabled) return;
    document.documentElement.dataset.workbenchStudy = 'results';
    document.documentElement.dataset.voiceLayout = 'focus';
    const url = new URL(location.href);
    url.searchParams.set('study', 'results');
    url.searchParams.set('voiceLayout', 'focus');
    history.replaceState(history.state, '', url);
    return () => {
      delete document.documentElement.dataset.workbenchStudy;
      delete document.documentElement.dataset.voiceLayout;
    };
  }, [enabled]);
  return <SubjectLayoutStudyContext.Provider value={enabled ? 'results' : null}>
    {children}
  </SubjectLayoutStudyContext.Provider>;
}
