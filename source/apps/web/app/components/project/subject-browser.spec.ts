import { describe, expect, it } from 'vitest';
import { buildSubjectTree } from './subject-tree';
import { filterSubjectGroups } from './subject-browser';
import type { Subject } from './types/subject';
const subject = (id: string, extra: Partial<Subject> = {}): Subject => ({
  id,
  name: id,
  displayName: null,
  description: null,
  category: 'Character',
  previewUrl: null,
  previewWithNameUrl: null,
  imagePrompt: null,
  subjectId: id,
  warning: null,
  generation: {
    activeCount: 0,
    statuses: [],
    latestCompletedTaskId: null,
    latestFailedTaskId: null,
  },
  voice: null,
  ctime: '2026-10-10',
  images: [],
  ...extra,
});
describe('asset browser groups', () => {
  const parent = subject('Cedric');
  const child = subject('Masked Figure', {
    parentId: 'Cedric',
    voice: { voiceId: 'voice-a', platform: 'test' },
  });
  const other = subject('Castle', { category: 'Environment' });
  const tree = buildSubjectTree([parent, child, other]);
  it('finds a variant without flattening its parent group', () => {
    const result = filterSubjectGroups(tree, '  MASKED  ', 'all');
    expect(result.map((n) => n.subject.id)).toEqual(['Cedric']);
    expect(result[0].children[0].subject.id).toBe('Masked Figure');
  });
  it('applies text and voice state to the same matching subject', () => {
    expect(filterSubjectGroups(tree, 'Cedric', 'bound')).toEqual([]);
    expect(filterSubjectGroups(tree, 'Masked', 'bound')).toHaveLength(1);
  });
  it('excludes scenery from missing voice results', () => {
    expect(filterSubjectGroups(tree, '', 'unbound').map((n) => n.subject.id)).toEqual(['Cedric']);
  });
  it('returns the complete gallery when filters are cleared', () => {
    expect(filterSubjectGroups(tree, '', 'all')).toEqual(tree);
  });
});
