import type { Subject } from './types/subject';
import type { SubjectTreeNode } from './subject-tree';
export type VoiceFilter = 'all' | 'bound' | 'unbound';

/** Keep complete groups so searching a variant never loses its parent context. */
export function filterSubjectGroups(
  nodes: SubjectTreeNode[],
  search: string,
  voiceFilter: VoiceFilter,
) {
  const query = search.trim().toLocaleLowerCase();
  const matches = (subject: Subject) => {
    const text =
      `${subject.name} ${subject.displayName ?? ''} ${subject.description ?? ''}`.toLocaleLowerCase();
    const voiceMatches =
      voiceFilter === 'all' ||
      (subject.category?.toLowerCase() === 'character' &&
        (voiceFilter === 'bound' ? !!subject.voice : !subject.voice));
    return (!query || text.includes(query)) && voiceMatches;
  };
  const containsMatch = (node: SubjectTreeNode): boolean =>
    matches(node.subject) || node.children.some(containsMatch);
  return nodes.filter(containsMatch);
}
