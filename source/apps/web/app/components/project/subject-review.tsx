import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@repo/ui/component/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@repo/ui/component/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@repo/ui/component/alert-dialog';
import {
  LucideArrowLeft,
  LucideChevronRight,
  LucideImage,
  LucideSearch,
  LucideMic,
  LucidePlus,
  LucidePlay,
  LucidePause,
  LucideMaximize2,
  LucidePanelLeft,
  LucideCheck,
  LucideHistory,
} from 'lucide-react';
import { useProjectSubjectsQuery } from './use-project-query';
import { buildSubjectTree, type SubjectTreeNode } from './subject-tree';
import { SubjectImageDialog } from './subject-image-dialog';
import { SubjectVoiceDialog } from './subject-voice-dialog';
import { SubjectPickerDialog } from './subject-picker-dialog';
import { SubjectWarningBanner } from './subject-warning-banner';
import { VoiceLibraryCards } from './voice-library-cards';
import { AddSubjectDialog, SubjectListSkeleton } from './subject-list';
import { useAudioPlayer } from './use-audio-player';
import type { Subject } from './types/subject';
import type { Voice } from './types/voice';
import './subject-review.css';

export function flattenAppearances(
  node: SubjectTreeNode,
  parents: string[] = [],
): { subject: Subject; path: string[] }[] {
  return [
    { subject: node.subject, path: parents },
    ...node.children.flatMap((child) =>
      flattenAppearances(child, [...parents, node.subject.displayName || node.subject.name]),
    ),
  ];
}
const nameOf = (s: Subject) => s.displayName || s.name;
const imageOf = (s: Subject) => s.previewUrl || s.previewWithNameUrl || undefined;
const voiceEnabled = (s: Subject) =>
  ['character', 'voice_only_speaker'].includes(s.category?.toLowerCase() ?? '');

export function SubjectReview(props: {
  projectId: string;
  reflixId: string;
  isProcessing: boolean;
}) {
  const query = useProjectSubjectsQuery(props.projectId);
  if (!query.data) {
    if (query.error) throw query.error;
    return <SubjectListSkeleton />;
  }
  return (
    <SubjectReviewContent
      key={props.projectId}
      {...props}
      subjects={query.data.subjects}
      voices={query.data.voices}
      userProjects={query.data.userProjects}
    />
  );
}

function SubjectReviewContent({
  subjects,
  voices,
  userProjects,
  projectId,
  reflixId,
}: {
  subjects: Subject[];
  voices: Voice[];
  userProjects: { id: string; name: string }[];
  projectId: string;
  reflixId: string;
}) {
  const { t } = useTranslation('components/ReflixSubjectList');
  const [category, setCategory] = useState(subjects.some(voiceEnabled) ? 'character' : 'all');
  const [search, setSearch] = useState('');
  const [missing, setMissing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const remembered = useRef(new Map<string, string>());
  const [editor, setEditor] = useState<'details' | 'image' | 'history' | 'voice'>('details');
  const [library, setLibrary] = useState(false);
  const [showList, setShowList] = useState(true);
  const [add, setAdd] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const promptRef = useRef('');
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(`reela-image-drafts-${projectId}`) || '{}');
    } catch {
      return {};
    }
  });
  const player = useAudioPlayer();
  const roots = useMemo(
    () =>
      buildSubjectTree(
        subjects.filter(
          (s) =>
            category === 'all' ||
            (category === 'character' ? voiceEnabled(s) : s.category?.toLowerCase() === category),
        ),
      ),
    [subjects, category],
  );
  const groups = useMemo(
    () => roots.map((root) => ({ root, items: flattenAppearances(root) })),
    [roots],
  );
  const query = search.trim().toLocaleLowerCase();
  const matches = (s: Subject) =>
    (!query ||
      `${nameOf(s)} ${s.name} ${s.description ?? ''}`.toLocaleLowerCase().includes(query)) &&
    (!missing || (voiceEnabled(s) && !s.voice));
  const visible = groups
    .map((g) => ({ ...g, hits: g.items.filter((i) => matches(i.subject)) }))
    .filter((g) => g.hits.length);
  const activeGroup =
    groups.find((g) => g.items.some((i) => i.subject.id === selectedId)) ??
    visible.find((g) => g.items.length > 1) ??
    visible[0];
  const selected =
    activeGroup?.items.find((i) => i.subject.id === selectedId)?.subject ??
    activeGroup?.root.subject;
  const voice = voices.find((v) => v.voiceId === selected?.voice?.voiceId);
  const voiceName = (s: Subject) =>
    voices.find((v) => v.voiceId === s.voice?.voiceId)?.name ||
    s.voice?.voiceId ||
    t(($) => $.review.unbound);
  const currentPath = activeGroup?.items.find((i) => i.subject.id === selected?.id)?.path ?? [];
  const navigate = (action: () => void) => {
    if (busy) return;
    if (dirty) {
      setPending(() => action);
      return;
    }
    player.stop();
    action();
  };
  const clearEditor = () => {
    setDirty(false);
    setPreview(null);
    setEditor('details');
    setBusy(false);
  };
  const choose = (s: Subject, rootId: string) =>
    navigate(() => {
      remembered.current.set(rootId, s.id);
      setSelectedId(s.id);
      clearEditor();
    });
  const openEditor = (mode: typeof editor) =>
    navigate(() => {
      player.stop();
      setDirty(false);
      setPreview(null);
      setEditor(mode);
    });
  const updateDraft = (keep: boolean) => {
    if (!selected) return;
    const next = { ...drafts };
    if (keep) next[selected.id] = promptRef.current;
    else delete next[selected.id];
    setDrafts(next);
    try {
      localStorage.setItem(`reela-image-drafts-${projectId}`, JSON.stringify(next));
    } catch {}
  };
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty || busy) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);
  useEffect(() => {
    if (selectedId && !subjects.some((s) => s.id === selectedId)) {
      setSelectedId(null);
      clearEditor();
    }
  }, [subjects, selectedId]);

  return (
    <div className='subject-review'>
      <SubjectWarningBanner subjects={subjects} reflixId={reflixId} />
      <div className='review-toolbar'>
        <div className='review-categories' role='group' aria-label={t(($) => $.review.roles)}>
          {(['character', 'environment', 'prop', 'all'] as const).map((key) => (
            <button
              key={key}
              disabled={busy}
              aria-pressed={!library && category === key}
              onClick={() =>
                navigate(() => {
                  setCategory(key);
                  setSelectedId(null);
                  setSearch('');
                  setMissing(false);
                  setLibrary(false);
                  clearEditor();
                })
              }
            >
              {key === 'all' ? t(($) => $.all) : t(($) => $[key])}
              <span>
                {
                  subjects.filter(
                    (s) =>
                      key === 'all' ||
                      (key === 'character' ? voiceEnabled(s) : s.category?.toLowerCase() === key),
                  ).length
                }
              </span>
            </button>
          ))}
        </div>
        <div className='review-tools'>
          <Button
            variant='ghost'
            size='sm'
            disabled={busy}
            onClick={() =>
              navigate(() => {
                setLibrary(!library);
                clearEditor();
              })
            }
          >
            <LucideMic className='size-4' />
            {library ? t(($) => $.review.backReview) : t(($) => $.review.library)}
          </Button>
          <Button size='sm' disabled={busy} onClick={() => navigate(() => setImportOpen(true))}>
            {t(($) => $.subjectPickerDialog.open)}
          </Button>
          <Button
            size='sm'
            variant='primary'
            disabled={busy}
            onClick={() => navigate(() => setAdd(true))}
          >
            <LucidePlus className='size-4' />
            {t(($) => $.review.add)}
          </Button>
        </div>
      </div>
      {library ? (
        <div className='review-library'>
          <VoiceLibraryCards voices={voices} />
        </div>
      ) : (
        <>
          <div className='review-context'>
            <button
              onClick={() => setShowList(!showList)}
              aria-label={t(($) => $.review.toggleList)}
            >
              <LucidePanelLeft className='size-4' />
            </button>
            <span>{t(($) => $.review.reviewTitle)}</span>
            <span className='review-context-hint'>
              {groups.length} {t(($) => $.review.groups)} /{' '}
              {groups.reduce((n, g) => n + g.items.length, 0)} {t(($) => $.review.count)}
            </span>
          </div>
          <div className={`review-layout ${showList ? '' : 'review-list-hidden'}`}>
            {showList && (
              <aside className='review-list' aria-label={t(($) => $.review.roles)}>
                <label className='review-search'>
                  <LucideSearch className='size-4' />
                  <input
                    disabled={busy}
                    aria-label={t(($) => $.review.search)}
                    placeholder={t(($) => $.review.search)}
                    value={search}
                    onChange={(e) => {
                      const value = e.target.value;
                      navigate(() => setSearch(value));
                    }}
                  />
                </label>
                {(category === 'character' || category === 'all') && (
                  <label className='review-filter'>
                    <input
                      type='checkbox'
                      disabled={busy}
                      checked={missing}
                      onChange={(e) => {
                        const value = e.target.checked;
                        navigate(() => setMissing(value));
                      }}
                    />
                    {t(($) => $.review.missingVoice)}
                  </label>
                )}
                {(query || missing) && (
                  <div className='review-result-count'>
                    {visible.reduce((n, g) => n + g.hits.length, 0)} {t(($) => $.review.matches)}{' '}
                    <button
                      disabled={busy}
                      onClick={() =>
                        navigate(() => {
                          setSearch('');
                          setMissing(false);
                        })
                      }
                    >
                      {t(($) => $.review.clear)}
                    </button>
                  </div>
                )}
                <div className='review-list-scroll'>
                  {visible.map((g) => (
                    <div key={g.root.subject.id}>
                      {query || missing ? (
                        <>
                          <div className='review-result-parent'>{nameOf(g.root.subject)}</div>
                          {g.hits.map(({ subject: s, path }) => (
                            <button
                              key={s.id}
                              className='review-role'
                              aria-label={`${nameOf(s)} ${path.join(' › ') || voiceName(s)}`}
                              aria-pressed={selected?.id === s.id}
                              disabled={busy}
                              onClick={() => choose(s, g.root.subject.id)}
                            >
                              <Thumbnail subject={s} />
                              <span>
                                <strong>{nameOf(s)}</strong>
                                <small>{path.join(' › ') || voiceName(s)}</small>
                              </span>
                            </button>
                          ))}
                        </>
                      ) : (
                        <button
                          className='review-role'
                          aria-pressed={activeGroup?.root.subject.id === g.root.subject.id}
                          disabled={busy}
                          onClick={() =>
                            choose(
                              g.items.find(
                                (i) => i.subject.id === remembered.current.get(g.root.subject.id),
                              )?.subject ?? g.root.subject,
                              g.root.subject.id,
                            )
                          }
                        >
                          <Thumbnail subject={g.root.subject} />
                          <span>
                            <strong>{nameOf(g.root.subject)}</strong>
                            <small>
                              {g.items.length} {t(($) => $.review.count)}
                              {g.items.some((i) => voiceEnabled(i.subject) && !i.subject.voice)
                                ? ' · ' + t(($) => $.review.unbound)
                                : ''}
                            </small>
                          </span>
                          <LucideChevronRight className='size-3.5' />
                        </button>
                      )}
                    </div>
                  ))}
                  {!visible.length && (
                    <div className='review-empty'>{t(($) => $.review.noResults)}</div>
                  )}
                </div>
              </aside>
            )}
            {selected && activeGroup ? (
              <>
                <main className='review-stage' aria-label={t(($) => $.review.current)}>
                  <header className='review-stage-header'>
                    <div>
                      <div className='review-eyebrow'>
                        {currentPath.join(' / ') || nameOf(activeGroup.root.subject)}
                      </div>
                      <h2>{nameOf(selected)}</h2>
                    </div>
                    <span className='review-position'>
                      {activeGroup.items.findIndex((i) => i.subject.id === selected.id) + 1} /{' '}
                      {activeGroup.items.length}
                    </span>
                  </header>
                  <button
                    className='review-main-image'
                    aria-label={t(($) => $.review.preview)}
                    onClick={() => setZoom(true)}
                    disabled={!imageOf(selected) && !preview}
                  >
                    {preview || imageOf(selected) ? (
                      <img src={preview || imageOf(selected)} alt={nameOf(selected)} />
                    ) : (
                      <span>
                        <LucideImage />
                        {t(($) => $.review.noImage)}
                      </span>
                    )}
                    <span className='review-zoom'>
                      <LucideMaximize2 className='size-4' />
                    </span>
                    {preview && (
                      <span className='review-preview-label'>
                        {t(($) => $.review.historyPreview)}
                      </span>
                    )}
                  </button>
                  <div className='review-strip-heading'>
                    <strong>{t(($) => $.review.appearances)}</strong>
                    <span>
                      {activeGroup.items.length} {t(($) => $.review.count)}
                    </span>
                  </div>
                  <div className='review-appearances' aria-label={t(($) => $.review.appearances)}>
                    {activeGroup.items.map(({ subject: s, path }) => (
                      <button
                        key={s.id}
                        disabled={busy}
                        aria-label={`${nameOf(s)} ${voiceEnabled(s) ? voiceName(s) : path.at(-1) || t(($) => $.review.image)}`}
                        aria-pressed={s.id === selected.id}
                        title={[...path, nameOf(s)].join(' / ')}
                        onClick={() => choose(s, activeGroup.root.subject.id)}
                      >
                        <Thumbnail subject={s} />
                        <strong>{nameOf(s)}</strong>
                        <small>
                          {voiceEnabled(s) ? voiceName(s) : path.at(-1) || t(($) => $.review.image)}
                        </small>
                        {s.id === selected.id && (
                          <span className='review-check'>
                            <LucideCheck className='size-3' />
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </main>
                <aside className='review-inspector' aria-label={t(($) => $.review.inspect)}>
                  <header className='review-inspector-header'>
                    <small>{t(($) => $.review.current)}</small>
                    <h3>{nameOf(selected)}</h3>
                    {editor !== 'details' && (
                      <button disabled={busy} onClick={() => openEditor('details')}>
                        <LucideArrowLeft className='size-3.5' />
                        {t(($) => $.review.back)}
                      </button>
                    )}
                  </header>
                  {selected.generation.activeCount > 0 && (
                    <p className='review-status'>Generating · {selected.generation.activeCount}</p>
                  )}
                  {selected.generation.latestFailedTaskId &&
                    selected.generation.activeCount === 0 && (
                      <p role='status' className='review-status review-warning'>
                        生成失败，请在图片编辑中重试
                      </p>
                    )}
                  {selected.warning && (
                    <p className='review-status review-warning'>
                      {t(($) => $.warningMessages.subject_generation_warning)}
                    </p>
                  )}
                  {editor === 'details' && (
                    <div className='review-details'>
                      <section>
                        <h4>
                          <LucideImage className='size-4' />
                          {t(($) => $.review.image)}
                        </h4>
                        <div className='review-action-row'>
                          <Button onClick={() => openEditor('image')}>
                            <LucideImage className='size-4' />
                            {t(($) => $.review.imageEdit)}
                          </Button>
                          <Button
                            aria-label={`${t(($) => $.review.history)} ${selected.images.length}`}
                            onClick={() => openEditor('history')}
                          >
                            <LucideHistory className='size-4' />
                            {t(($) => $.review.history)}
                            <span>{selected.images.length}</span>
                          </Button>
                        </div>
                      </section>
                      {voiceEnabled(selected) && (
                        <section>
                          <h4>
                            <LucideMic className='size-4' />
                            {t(($) => $.review.voice)}
                          </h4>
                          <div className='review-current-voice'>
                            <button
                              aria-label={t(($) => $.review.previewVoice)}
                              disabled={!voice?.previewUrl}
                              onClick={() => voice?.previewUrl && player.play(voice.previewUrl)}
                            >
                              {voice && player.isPlaying(voice.previewUrl) ? (
                                <LucidePause className='size-4' />
                              ) : (
                                <LucidePlay className='size-4' />
                              )}
                            </button>
                            <div>
                              <strong>{voiceName(selected)}</strong>
                              <small>{t(($) => $.review.singleScope)}</small>
                            </div>
                          </div>
                          <Button className='w-full' onClick={() => openEditor('voice')}>
                            {t(($) => $.review.changeVoice)}
                          </Button>
                        </section>
                      )}
                      <details>
                        <summary>{t(($) => $.review.description)}</summary>
                        <p>{selected.description || t(($) => $.review.noDescription)}</p>
                      </details>
                    </div>
                  )}
                  {(editor === 'image' || editor === 'history') && (
                    <div className='review-editor-body'>
                      {drafts[selected.id] !== undefined && (
                        <p className='review-draft-note'>{t(($) => $.review.draftSaved)}</p>
                      )}
                      <SubjectImageDialog
                        key={`${selected.id}:${editor}`}
                        embedded
                        subject={selected}
                        projectId={projectId}
                        parentImageUrl={
                          subjects.find((s) => s.id === selected.parentId)?.previewUrl
                        }
                        initialTab={editor === 'history' ? 'history' : 'regenerate'}
                        draftPrompt={drafts[selected.id]}
                        onPromptChange={(prompt) => {
                          promptRef.current = prompt;
                          setDirty(prompt !== (drafts[selected.id] ?? selected.imagePrompt ?? ''));
                        }}
                        onPreviewChange={setPreview}
                        onBusyChange={setBusy}
                        onClose={() => {
                          updateDraft(false);
                          clearEditor();
                        }}
                      />
                    </div>
                  )}
                  {editor === 'voice' && (
                    <div className='review-editor-body'>
                      <SubjectVoiceDialog
                        key={selected.id}
                        embedded
                        subject={selected}
                        rootSubject={activeGroup.root.subject}
                        affectedSubjects={activeGroup.items.map((i) => i.subject)}
                        scope={activeGroup.items.length > 1 ? 'subtree' : 'subject'}
                        hasBoundVoice={activeGroup.items.some((i) => !!i.subject.voice)}
                        reflixId={reflixId}
                        projectId={projectId}
                        voices={voices}
                        userProjects={userProjects}
                        onBusyChange={setBusy}
                        onDone={clearEditor}
                      />
                    </div>
                  )}
                </aside>
              </>
            ) : (
              <div className='review-empty'>{t(($) => $.review.noResults)}</div>
            )}
          </div>
        </>
      )}
      <AddSubjectDialog open={add} onOpenChange={setAdd} reflixId={reflixId} />
      <SubjectPickerDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        targetReflixId={reflixId}
        currentProjectId={projectId}
        userProjects={userProjects}
      />
      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className='review-zoom-dialog' aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{selected && nameOf(selected)}</DialogTitle>
          </DialogHeader>
          <img
            src={preview || (selected && imageOf(selected))}
            alt={selected ? nameOf(selected) : ''}
          />
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!pending}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(($) => $.review.draftTitle)}</AlertDialogTitle>
            <AlertDialogDescription>{t(($) => $.review.draftBody)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button onClick={() => setPending(null)}>{t(($) => $.review.stay)}</Button>
            <Button
              onClick={() => {
                updateDraft(false);
                setDirty(false);
                player.stop();
                pending?.();
                setPending(null);
              }}
            >
              {t(($) => $.review.discard)}
            </Button>
            <Button
              variant='primary'
              onClick={() => {
                updateDraft(true);
                setDirty(false);
                player.stop();
                pending?.();
                setPending(null);
              }}
            >
              {t(($) => $.review.saveDraft)}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
function Thumbnail({ subject }: { subject: Subject }) {
  return (
    <span className='review-thumb'>
      {imageOf(subject) ? (
        <img src={imageOf(subject)} alt='' loading='lazy' />
      ) : (
        <LucideImage className='size-5' />
      )}
    </span>
  );
}
