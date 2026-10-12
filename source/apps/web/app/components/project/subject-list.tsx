import './subject-card-interactions.css';
import { Badge } from '@repo/ui/component/badge';
import {
  LucideChevronDown,
  LucideChevronUp,
  LucideImages,
  LucideLoader2,
  LucideMic,
  LucidePlus,
  LucideTriangleAlert,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useProjectMutation } from '~/modules/project/use-project-mutation';
import { toast } from '@repo/ui/component/toaster';
import { Card, CardContent, CardGrid } from '@repo/ui/component/card';
import type { Subject } from './types/subject';
import type { Voice } from './types/voice';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/component/dialog';
import { Button } from '@repo/ui/component/button';
import { useTranslation } from 'react-i18next';
import { VoiceLibraryCards } from './voice-library-cards';
import { SubjectPickerDialog } from './subject-picker-dialog';
import { SubjectImageDialog } from './subject-image-dialog';
import { SubjectPlaceholderIcon } from './subject-placeholder-icon';
import { SubjectPreviewStack } from './subject-preview-stack';
import { SubjectVariantCard, type SubjectVariantGroup } from './subject-variant-card';
import { useProjectSubjectsQuery } from './use-project-query';
import { SubjectWarningBanner } from './subject-warning-banner';
import { Skeleton } from '@repo/ui/component/skeleton';
import { buildSubjectTree, type SubjectTreeNode } from './subject-tree';

type SubjectListProps = {
  isProcessing: boolean;
  reflixId: string;
  projectId: string;
};

type SubjectListContentProps = SubjectListProps & {
  subjects: Subject[];
  voices: Voice[];
  userProjects: { id: string; name: string }[];
};

const FILTER_LIST = ['all', 'character', 'environment', 'prop', 'voice'] as const;

export function SubjectList(props: SubjectListProps) {
  const subjectsQuery = useProjectSubjectsQuery(props.projectId);

  if (!subjectsQuery.data) {
    if (subjectsQuery.error) {
      throw subjectsQuery.error;
    }
    return <SubjectListSkeleton />;
  }

  return (
    <>
      <SubjectWarningBanner subjects={subjectsQuery.data.subjects} reflixId={props.reflixId} />
      <SubjectListContent
        {...props}
        key={props.projectId}
        subjects={subjectsQuery.data.subjects}
        voices={subjectsQuery.data.voices}
        userProjects={subjectsQuery.data.userProjects}
      />
    </>
  );
}

export function SubjectListSkeleton() {
  return (
    <div className='subject-browser-layout space-y-4 px-4'>
      <div className='subject-browser-toolbar flex flex-wrap items-center gap-2'>
        <div className='flex min-w-0 flex-wrap gap-2'>
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className='h-9 w-24' />
          ))}
        </div>
        <Skeleton className='ml-auto h-9 w-36' />
      </div>
      <CardGrid>
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className='overflow-hidden rounded-xl border'>
            <Skeleton className='aspect-video w-full rounded-none' />
            <div className='space-y-3 p-4'>
              <Skeleton className='h-6 w-2/3' />
              <Skeleton className='h-4 w-full' />
              <Skeleton className='h-4 w-4/5' />
            </div>
            <div className='flex justify-end gap-2 border-t p-2'>
              <Skeleton className='h-9 w-9' />
              <Skeleton className='h-9 w-24' />
            </div>
          </div>
        ))}
      </CardGrid>
    </div>
  );
}

function SubjectListContent({
  subjects,
  isProcessing,
  reflixId,
  projectId,
  voices,
  userProjects,
}: SubjectListContentProps) {
  const { t } = useTranslation('components/ReflixSubjectList');

  const filterListLabel = useMemo(() => {
    return {
      all: t(($) => $.all),
      character: t(($) => $.character),
      environment: t(($) => $.environment),
      prop: t(($) => $.prop),
      voice: t(($) => $.voiceMenu.library),
    };
  }, [t]);

  const [addOpen, setAddOpen] = useState(false);
  const [addInitialTab, setAddInitialTab] = useState('regenerate');
  const [subjectPickerOpen, setSubjectPickerOpen] = useState(false);
  const [imageSubjectId, setImageSubjectId] = useState<string | null>(null);
  const [imageInitialTab, setImageInitialTab] = useState('regenerate');
  const editorTriggerRef = useRef<HTMLElement | null>(null);
  const imageSubject = subjects.find((subject) => subject.id === imageSubjectId);
  const imageGroup = buildSubjectTree(subjects)
    .map(collectAppearances)
    .find((group) => group.some((subject) => subject.id === imageSubjectId));
  const openSubjectImage = (subject: Subject, tab = 'regenerate') => {
    editorTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setImageInitialTab(tab);
    setImageSubjectId(subject.id);
  };
  const seenGenerationTaskIdsRef = useRef(new Set<string>());

  useEffect(() => {
    for (const subject of subjects) {
      for (const status of subject.generation.statuses) {
        if (status.status === 'waiting' || status.status === 'active') {
          seenGenerationTaskIdsRef.current.add(status.taskId);
        }
      }

      const completedTaskId = subject.generation.latestCompletedTaskId;
      if (completedTaskId && seenGenerationTaskIdsRef.current.has(completedTaskId)) {
        seenGenerationTaskIdsRef.current.delete(completedTaskId);
        toast.success(
          `Subject image generation completed for ${subject.displayName || subject.name}`,
        );
      }
    }
  }, [subjects]);

  const [filter, setFilter] = useState<(typeof FILTER_LIST)[number]>('all');
  const filteredSubjects = useMemo(() => {
    if (filter === 'all') {
      return subjects;
    }
    return subjects.filter((s) => s.category?.toLowerCase() === filter);
  }, [subjects, filter]);

  const subjectTree = useMemo(
    () => buildSubjectTree(filteredSubjects),
    [filteredSubjects],
  );
  const stats = useMemo(() => {
    const characters = subjects.filter((s) => s.category?.toLowerCase() === 'character');
    const props = subjects.filter((s) => s.category?.toLowerCase() === 'prop');
    const environment = subjects.filter((s) => s.category?.toLowerCase() === 'environment');
    return {
      character: ` (${characters.length})`,
      prop: ` (${props.length})`,
      environment: ` (${environment.length})`,
      voice: '',
    };
  }, [subjects]);

  return (
    <div className='subject-browser-layout space-y-4 px-4'>
      <div className='subject-browser-toolbar flex flex-wrap items-center gap-2'>
        {subjects.length > 0 ? (
          <div className='flex min-w-0 flex-wrap gap-2'>
            {FILTER_LIST.map((f) => {
              return (
                <Button
                  key={f}
                  className='capitalize'
                  variant={filter === f ? 'primary' : 'default'}
                  onClick={() => {
                    setFilter(f);
                  }}
                >
                  {filterListLabel[f]}
                  {stats[f]}
                </Button>
              );
            })}
          </div>
        ) : null}
        <Button className='ml-auto' onClick={() => setSubjectPickerOpen(true)}>
          <LucideImages />
          {t(($) => $.subjectPickerDialog.open)}
        </Button>
        <Button variant='primary' onClick={() => {setAddInitialTab('regenerate');setAddOpen(true);}}>
          <LucidePlus className='size-4' />
          {t(($) => $.addYourSubject.title)}
        </Button>
      </div>
      {subjects.length > 0 ? (
        <>
          <CardGrid
            className='subject-browser-grid overflow-y-auto'
            style={{
              maxHeight: 'calc(100vh - var(--header-height) - 11rem)',
            }}
          >
            {filter === 'voice' ? (
              <VoiceLibraryCards voices={voices} />
            ) : (
              <>
                {subjectTree.length === 0 && (
                  <p className='text-secondary col-span-full py-8 text-center'>
                    {t(($) => $.browser.empty)}
                  </p>
                )}
                {subjectTree.map((node) => (
                  <SubjectTreeItem
                    key={node.subject.id}
                    node={node}
                    reflixId={reflixId}
                    voices={voices}
                    userProjects={userProjects}
                    projectId={projectId}
                    onClickImage={openSubjectImage}
                    onClickVoice={(subject) => openSubjectImage(subject, 'voice')}
                  />
                ))}
              </>
            )}
          </CardGrid>
        </>
      ) : (
        <div className='border-border/60 bg-background-200 rounded-2xl border border-dashed p-10 text-center'>
          <p className='text-base font-medium'>
            {isProcessing ? 'No subjects yet' : 'Subjects unavailable'}
          </p>
          <p className='text-muted-foreground mt-2 text-sm'>
            {isProcessing
              ? 'We will populate the subject gallery once the project completes.'
              : 'This project has no subjects recorded.'}
          </p>
        </div>
      )}
      <AddSubjectDialog open={addOpen} onOpenChange={setAddOpen} reflixId={reflixId}
        projectId={projectId} initialTab={addInitialTab} onCreated={(id) => {setImageInitialTab('regenerate');setImageSubjectId(id);}} />
      <SubjectPickerDialog
        open={subjectPickerOpen}
        onOpenChange={setSubjectPickerOpen}
        currentProjectId={projectId}
        targetReflixId={reflixId}
        userProjects={userProjects}
        onCreateFromUpload={() => {setSubjectPickerOpen(false);setAddInitialTab('upload');setAddOpen(true);}}
      />
      {imageSubject && (
        <SubjectImageDialog
          key={imageGroup?.[0].id ?? imageSubject.id}
          appearances={imageGroup}
          voices={voices}
          userProjects={userProjects}
          reflixId={reflixId}
          onSelectSubject={(subject) => setImageSubjectId(subject.id)}
          subject={imageSubject}
          initialTab={imageInitialTab}
          projectId={projectId}
          onClose={() => setImageSubjectId(null)}
          onReturnFocus={() => editorTriggerRef.current?.focus()}
          parentImageUrl={
            imageSubject.parentId
              ? (() => {
                  const parent = subjects.find((subject) => subject.id === imageSubject.parentId);
                  return parent?.previewUrl || parent?.previewWithNameUrl;
                })()
              : undefined
          }
        />
      )}
    </div>
  );
}

type SubjectItemProps = {
  subject: Subject;
  groupRoot?: Subject;
  appearances?: Subject[];
  appearanceSelector?: ReactNode;
  onClickImage: (subject: Subject) => void;
  onClickVoice: (subject: Subject) => void;
  reflixId: string;
  voices: Voice[];
  userProjects: { id: string; name: string }[];
  projectId: string;
  variantGroup?: SubjectVariantGroup;
  isVariant?: boolean;
  canApplyToVariants?: boolean;
  previewVariants?: Subject[];
  hasBoundVoice?: boolean;
};

function hasBoundVoiceInTree(node: SubjectTreeNode): boolean {
  return !!node.subject.voice || node.children.some(hasBoundVoiceInTree);
}

function collectAppearances(node: SubjectTreeNode): Subject[] {
  return [node.subject, ...node.children.flatMap(collectAppearances)];
}

function SubjectTreeItem({
  node,
  ...itemProps
}: Omit<SubjectItemProps, 'subject' | 'variantGroup' | 'previewVariants' | 'hasBoundVoice'> & {
  node: SubjectTreeNode;
}) {
  const appearances = collectAppearances(node);
  return (
    <div className='h-full min-w-0' data-subject-id={node.subject.id}>
      <SubjectItem
        {...itemProps}
        subject={node.subject}
        groupRoot={node.subject}
        appearances={appearances}
        previewVariants={node.children.map((child) => child.subject)}
        canApplyToVariants={appearances.length > 1}
        hasBoundVoice={hasBoundVoiceInTree(node)}
      />
    </div>
  );
}

function SubjectItem({
  subject,
  groupRoot,
  appearances,
  appearanceSelector,
  onClickImage,
  onClickVoice,
  reflixId,
  voices,
  userProjects,
  projectId,
  variantGroup,
  isVariant = false,
  canApplyToVariants = false,
  previewVariants = [],
  hasBoundVoice = !!subject.voice,
}: SubjectItemProps) {
  const { t } = useTranslation('components/ReflixSubjectList');

  const matchedVoice = useMemo(() => {
    if (!subject.voice) return null;
    return voices.find((v) => v.voiceId === subject.voice!.voiceId) ?? null;
  }, [subject.voice, voices]);

  const showVoiceMenu =
    subject.category?.toLowerCase() === 'character' ||
    subject.category?.toLowerCase() === 'voice_only_speaker';

  const categoryLabel = useMemo(() => {
    const map = {
      character: t(($) => $.character),
      environment: t(($) => $.environment),
      prop: t(($) => $.prop),
      voice_only_speaker: t(($) => $.voiceOnlySpeaker),
    };

    if (!subject.category) {
      return subject.category;
    }

    return map[subject.category.toLowerCase()] || subject.category;
  }, [t, subject.category]);

  const warningMessages: Record<string, string> = {
    input_image_copyright_policy_violation: t(
      ($) => $.warningMessages.input_image_copyright_policy_violation,
    ),
    subject_generation_warning: t(($) => $.warningMessages.subject_generation_warning),
  };
  const warningMessage = subject.warning
    ? (warningMessages[subject.warning.messageKey] ??
      t(($) => $.warningMessages.subject_generation_warning))
    : null;

  const preview = subject.previewUrl || subject.previewWithNameUrl || undefined;

  const currentImageIsRegenerated = subject.images.some(
    (image) => image.isCurrent && image.source === 'regenerated',
  );

  const voiceControls = showVoiceMenu && (
    <div className='subject-card-voice pointer-events-auto flex min-w-0 items-center'>
        <Button
          variant='ghost'
          size='sm'
          className='subject-card-voice-button'
          aria-label={t(($) => $.editVoice, { subjectName: subject.displayName || subject.name })}
          title={matchedVoice?.name || subject.voice?.voiceId || t(($) => $.setVoice)}
          data-bound={hasBoundVoice}
          onClick={() => onClickVoice(subject)}
        >
          <LucideMic className='size-3.5' />
        </Button>
    </div>
  );

  return (
    <>
      {isVariant ? (
        <SubjectVariantCard
          subject={subject}
          warningMessage={warningMessage}
          variantGroup={variantGroup}
          previewVariants={previewVariants}
          onClickImage={() => onClickImage(subject)}
          voiceControls={voiceControls}
        />
      ) : (
        <Card
          className={`subject-grid-card h-full gap-0 overflow-hidden rounded-xl p-0 ${
            subject.warning ? 'border-yellow-300 ring-1 ring-yellow-200' : ''
          }`}
        >
          <CardContent className='flex-1 gap-0 p-0'>
            <div className='relative'>
              <SubjectPreviewStack variants={previewVariants}>
                <div className='relative h-full'>
                  <button
                    type='button'
                    className='group block h-full w-full cursor-pointer text-left focus-visible:outline-2 focus-visible:-outline-offset-2 disabled:cursor-default'
                    aria-label={t(($) => $.imageDialog.title)}
                    onClick={() => onClickImage(subject)}
                  >
                    <div className='bg-background-200 relative block h-full'>
                      {preview ? (
                        <img
                          src={preview}
                          alt={subject.name}
                          className='h-full w-full object-cover object-top'
                          loading='lazy'
                        />
                      ) : (
                        <div className='flex h-full w-full items-center justify-center text-xs'>
                          <SubjectPlaceholderIcon category={subject.category} className='size-8' />
                        </div>
                      )}
                      <div className='absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/20 group-hover:opacity-100 group-focus-visible:bg-black/20 group-focus-visible:opacity-100'>
                        <LucideImages className='size-6 text-white' />
                      </div>
                      {subject.category && (
                        <Badge className='absolute bottom-1 left-1'>{categoryLabel}</Badge>
                      )}
                      {appearances && appearances.length > 1 && (
                        <Badge
                          className='absolute top-1 left-1 min-w-6 justify-center'
                          aria-label={t(($) => $.variantCount, {
                            count: (appearances?.length ?? 1) - 1,
                          })}
                        >
                          {(appearances?.length ?? 1) - 1}
                        </Badge>
                      )}
                      <div className='absolute top-1 right-1 flex flex-col items-end gap-1'>
                        {subject.generation.activeCount > 0 && (
                          <Badge className='bg-blue-100 text-blue-900'>
                            <LucideLoader2 className='spin size-3' />
                            Generating
                          </Badge>
                        )}
                        {subject.generation.latestFailedTaskId &&
                          subject.generation.activeCount === 0 && (
                            <Badge className='border-red-300 bg-red-100 text-red-900'>
                              <LucideTriangleAlert className='size-3' />
                              Failed
                            </Badge>
                          )}
                        {currentImageIsRegenerated &&
                          !subject.generation.latestFailedTaskId &&
                          subject.generation.activeCount === 0 && (
                            <Badge className='bg-green-100 text-green-900'>Done</Badge>
                          )}
                      </div>
                    </div>
                  </button>
                </div>
              </SubjectPreviewStack>
            </div>
            <div className='subject-card-copy space-y-1.5 px-3 pt-2.5 pb-3'>
              <div className='subject-card-heading flex min-w-0 items-center gap-2'>
                <h3
                  className='min-w-0 flex-1 truncate text-base leading-6 font-semibold'
                  title={subject.displayName || subject.name}
                >
                  {subject.displayName || subject.name}
                </h3>
                {voiceControls}
              </div>
              {warningMessage && (
                <div className='flex gap-2 rounded-md border border-yellow-200 bg-yellow-50 p-2 text-xs text-yellow-900'>
                  <LucideTriangleAlert className='mt-0.5 size-3.5 shrink-0' />
                  <span>{warningMessage}</span>
                </div>
              )}
              {subject.generation.latestFailedTaskId && subject.generation.activeCount === 0 && (
                <div className='flex gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-900'>
                  <LucideTriangleAlert className='mt-0.5 size-3.5 shrink-0' />
                  <span>生成失败，请重试</span>
                </div>
              )}
              {subject.description && (
                <p className='text-muted-foreground line-clamp-2 text-xs leading-[18px] break-words'>
                  {subject.description}
                </p>
              )}
            </div>
          </CardContent>
          {appearanceSelector}
        </Card>
      )}
    </>
  );
}

const NEW_SUBJECT: Subject = {
  id: 'new-subject', subjectId: '', name: '', displayName: null, description: null,
  category: 'character', previewUrl: null, previewWithNameUrl: null, imagePrompt: null,
  warning: null, voice: null, ctime: '', images: [],
  generation: { activeCount: 0, statuses: [], latestCompletedTaskId: null, latestFailedTaskId: null },
};

export function AddSubjectDialog({ open, onOpenChange, reflixId, projectId = reflixId, onCreated, initialTab = 'regenerate' }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reflixId: string;
  projectId?: string;
  onCreated?: (subjectId: string) => void;
  initialTab?: string;
}) {
  if (!open) return null;
  return <SubjectImageDialog subject={NEW_SUBJECT} projectId={projectId} reflixId={reflixId}
    create initialTab={initialTab} onCreated={onCreated} onClose={() => onOpenChange(false)} />;
}
