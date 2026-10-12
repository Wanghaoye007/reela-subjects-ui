import { createContext } from 'react';

/** Optional layout study enabled only by the local preview shell. */
export type SubjectLayoutStudy = 'compact' | 'results' | 'canvas';
export const SubjectLayoutStudyContext = createContext<SubjectLayoutStudy | null>(null);
