import { Button } from '@repo/ui/component/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@repo/ui/component/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@repo/ui/component/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/component/tabs';
import { toast } from '@repo/ui/component/toaster';
import { LucideAudioLines, LucideLoader2, LucidePause, LucidePlay, LucideUnlink } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { SubjectVoiceScope } from '~/modules/project/subject-voice-target';
import { useProjectMutation } from '~/modules/project/use-project-mutation';
import type { Subject } from './types/subject';
import type { Voice } from './types/voice';
import { useAudioPlayer } from './use-audio-player';
import { VoiceClonePanel } from './voice-clone-panel';
import { VoiceDesignPanel } from './voice-design-panel';
import { VoicePickerPanel } from './voice-picker-panel';

type SubjectVoiceDialogProps = {
  children?: ReactNode;
  embedded?: boolean;
  rootSubject?: Subject;
  affectedSubjects?: Subject[];
  onBusyChange?: (busy: boolean) => void;
  onDone?: () => void;
  subject: Subject;
  scope: SubjectVoiceScope;
  hasBoundVoice: boolean;
  reflixId: string;
  voices: Voice[];
  userProjects: { id: string; name: string }[];
  projectId: string;
};

export function SubjectVoiceDialog({
  children,
  embedded = false,
  rootSubject,
  affectedSubjects = [],
  onBusyChange,
  onDone,
  subject,
  scope,
  hasBoundVoice,
  reflixId,
  voices,
  userProjects,
  projectId,
}: SubjectVoiceDialogProps) {
  const { t } = useTranslation('components/ReflixSubjectList');
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('library');
  const [targetScope, setTargetScope] = useState<SubjectVoiceScope>('subject');
  const [designBusy, setDesignBusy] = useState(false);
  const [cloneBusy, setCloneBusy] = useState(false);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [pendingChange, setPendingChange] = useState<(() => void) | null>(null);
  const player = useAudioPlayer();
  const currentVoice = voices.find((voice) => voice.voiceId === subject.voice?.voiceId);

  const close = () => {
    player.stop();
    setOpen(false);
    onDone?.();
    setDesignBusy(false);
    setCloneBusy(false);
    setPickerBusy(false);
    setPendingChange(null);
  };

  const unbindMutation = useProjectMutation({
    onError(message) {
      toast.error(message);
    },
    onSuccess: player.stop,
  });
  const busy =
    designBusy || cloneBusy || pickerBusy || unbindMutation.isPending || pendingChange !== null;
  const requestVoiceChange = (change: () => void) => {
    player.stop();
    if (targetScope === 'subtree') {
      setPendingChange(() => change);
    } else {
      change();
    }
  };
  const scopeControl = (panel: string) => scope === 'subtree' ? (
        <fieldset disabled={busy} className='voice-scope-control'>
          <legend className='sr-only'>{t(($) => $.browser.scope)}</legend>
          <div className='voice-scope-options'>
            <label className='voice-scope-option'>
              <input
                type='radio'
                name={`scope-${subject.id}-${panel}`}
                checked={targetScope === 'subject'}
                onChange={() => setTargetScope('subject')}
              />
              {t(($) => $.browser.currentOnly)}
            </label>
            <label className='voice-scope-option'>
              <input
                type='radio'
                name={`scope-${subject.id}-${panel}`}
                checked={targetScope === 'subtree'}
                onChange={() => setTargetScope('subtree')}
              />
              {embedded
                ? t(($) => $.review.groupScope, { count: affectedSubjects.length })
                : t(($) => $.browser.allVariants)}
            </label>
          </div>
        </fieldset>
      ) : null;
  const footerLeading = (panel: string) => <div className='voice-footer-leading'>
    {scopeControl(panel)}
  </div>;
  const panelProps = {
    subjectId: targetScope === 'subtree' ? (rootSubject?.id ?? subject.id) : subject.id,
    scope: targetScope,
    player,
    onRequestChange: requestVoiceChange,
    footerLeading,
  };

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  return (
    <VoiceEditorFrame
      embedded={embedded}
      title={t(($) => $.editVoice, { subjectName: subject.displayName || subject.name })}
      trigger={children}
      busy={busy}
      open={open}
      onOpenChange={(nextOpen) => {
        if (busy) return;
        if (nextOpen) {
          setTab('library');
          setTargetScope('subject');
          setOpen(true);
        } else {
          close();
        }
      }}
    >
      <div className='voice-current-row'>
        <span className='voice-current-icon' aria-hidden='true'><LucideAudioLines /></span>
        <div className='voice-current-identity'>
          <div className='voice-current-label'>{t(($) => $.flow.appliedVoice)}</div>
          {subject.voice ? (
            <div className='voice-current-name truncate text-sm font-medium' title={currentVoice?.name || subject.voice.voiceId}>
              {currentVoice?.name || subject.voice.voiceId}
            </div>
          ) : (
            <p className='voice-current-name text-secondary truncate text-sm'>
              {t(($) => (hasBoundVoice ? $.voiceBinding.variantsBound : $.voiceBinding.unbound))}
            </p>
          )}
        </div>
        <div className='voice-current-actions'>
        {currentVoice?.previewUrl && (
          <Button
            variant='ghost'
            size='sm'
            className='voice-current-preview'
            onClick={() => player.play(currentVoice.previewUrl)}
            aria-label={t(($) => $.voicePickerDialog.preview)}
            title={t(($) => $.voicePickerDialog.preview)}
          >
            {player.isPlaying(currentVoice.previewUrl) ? (
              <LucidePause className='size-4' />
            ) : (
              <LucidePlay className='size-4' />
            )}
            <span>{t(($) => $.voicePickerDialog.preview)}</span>
          </Button>
        )}
        {(targetScope === 'subtree' ? hasBoundVoice : !!subject.voice) && (
          <Button
            variant='default'
            size='sm'
            className='voice-unbind'
            aria-label={t(($) => $.voiceMenu.unbindVoice)}
            title={t(($) => $.voiceMenu.unbindVoice)}
            disabled={busy}
            onClick={() =>
              requestVoiceChange(() => {
                unbindMutation.unbindVoice({
                  subjectId:
                    targetScope === 'subtree' ? (rootSubject?.id ?? subject.id) : subject.id,
                  scope: targetScope,
                });
              })
            }
          >
            {unbindMutation.isPending ? (
              <LucideLoader2 className='size-4 animate-spin' />
            ) : (
              <LucideUnlink className='size-4' />
            )}
            <span className='sr-only'>{t(($) => $.voiceMenu.unbindVoice)}</span>
          </Button>
        )}
        </div>
      </div>
      <Tabs
        className='voice-source-tabs min-h-0 flex-1'
        value={tab}
        onValueChange={(value) => {
          if (busy) return;
          player.stop();
          setTab(value);
        }}
      >
        <TabsList variant='underline' className='voice-source-choices h-auto shrink-0 items-stretch'>
          <TabsTrigger variant='underline' value='library' disabled={busy} className='h-auto whitespace-normal'>
            {t(($) => $.voiceMenu.library)}
          </TabsTrigger>
          <TabsTrigger variant='underline' value='design' disabled={busy} className='h-auto whitespace-normal'>
            {t(($) => $.voiceMenu.designVoice)}
          </TabsTrigger>
          <TabsTrigger variant='underline' value='clone' disabled={busy} className='h-auto whitespace-normal'>
            {t(($) => $.voiceMenu.cloneVoice)}
          </TabsTrigger>
        </TabsList>
        <div className='min-h-0 flex-1 overflow-hidden' inert={unbindMutation.isPending}>
          <TabsContent
            value='design'
            forceMount
            hidden={tab !== 'design'}
            className='h-full min-h-0'
          >
            <VoiceDesignPanel
              {...panelProps}
              reflixId={reflixId}
              onSaved={close}
              onBusyChange={setDesignBusy}
            />
          </TabsContent>
          <TabsContent value='clone' forceMount hidden={tab !== 'clone'} className='h-full min-h-0'>
            <VoiceClonePanel
              {...panelProps}
              reflixId={reflixId}
              onSaved={close}
              onBusyChange={setCloneBusy}
            />
          </TabsContent>
          <TabsContent
            value='library'
            forceMount
            hidden={tab !== 'library'}
            className='h-full min-h-0'
          >
            <VoicePickerPanel
              {...panelProps}
              assignedVoiceIds={
                embedded
                  ? (targetScope === 'subtree' ? affectedSubjects : [subject]).map(
                      (s) => s.voice?.voiceId ?? null,
                    )
                  : undefined
              }
              confirmLabel={
                embedded
                  ? t(
                      ($) =>
                        targetScope === 'subtree' ? $.review.applyGroup : $.review.applySingle,
                      { count: affectedSubjects.length },
                    )
                  : undefined
              }
              voices={voices}
              userProjects={userProjects}
              currentProjectId={projectId}
              onBusyChange={setPickerBusy}
            />
          </TabsContent>
        </div>
      </Tabs>
      <AlertDialog
        open={pendingChange !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPendingChange(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(($) => $.subtreeVoiceConfirmation.title)}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(($) => $.subtreeVoiceConfirmation.description)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {affectedSubjects.length > 0 && <div className='review-targets voice-confirm-targets'>
            {affectedSubjects.map((s) => <div key={s.id}>
              <span>{s.displayName || s.name}</span>
              <span>{voices.find((v) => v.voiceId === s.voice?.voiceId)?.name ||
                s.voice?.voiceId || t(($) => $.review.unbound)}</span>
            </div>)}
          </div>}
          <AlertDialogFooter>
            <AlertDialogCancel>{t(($) => $.subtreeVoiceConfirmation.cancel)}</AlertDialogCancel>
            <AlertDialogAction
              variant='primary'
              onClick={() => {
                setPendingChange(null);
                pendingChange?.();
              }}
            >
              {t(($) => $.subtreeVoiceConfirmation.confirm)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </VoiceEditorFrame>
  );
}

function VoiceEditorFrame({
  embedded,
  title,
  trigger,
  busy,
  open,
  onOpenChange,
  children,
}: {
  embedded: boolean;
  title: string;
  trigger?: ReactNode;
  busy: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  if (embedded)
    return (
      <section className='review-voice-editor' aria-label={title}>
        {children}
      </section>
    );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        aria-describedby={undefined}
        className='subject-voice-dialog h-[min(680px,90dvh)] overflow-hidden'
        onInteractOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
