import { Badge } from '@repo/ui/component/badge';
import { Button } from '@repo/ui/component/button';
import { DialogFooter } from '@repo/ui/component/dialog';
import { SearchInput } from '@repo/ui/component/search-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/component/select';
import { toast } from '@repo/ui/component/toaster';
import { LucideCheck, LucideLoader2, LucidePause, LucidePlay } from 'lucide-react';
import { type ReactNode, useEffect, useId, useMemo, useState } from 'react';
import { href, useFetcher } from 'react-router';
import { Virtuoso } from 'react-virtuoso';
import { useProjectMutation } from '~/modules/project/use-project-mutation';
import type { SubjectVoiceScope } from '~/modules/project/subject-voice-target';
import { useTranslation } from 'react-i18next';
import type { Voice } from './types/voice';
import type { useAudioPlayer } from './use-audio-player';

type VoicePickerPanelProps = {
  assignedVoiceIds?: (string | null)[];
  confirmLabel?: string;
  footerLeading?: (panel: string) => ReactNode;
  onRequestChange: (change: () => void) => void;
  onBusyChange: (busy: boolean) => void;
  player: ReturnType<typeof useAudioPlayer>;
  subjectId: string;
  scope: SubjectVoiceScope;
  voices: Voice[];
  userProjects: { id: string; name: string }[];
  currentProjectId: string;
};

export function VoicePickerPanel({
  assignedVoiceIds,
  confirmLabel,
  footerLeading,
  onRequestChange,
  onBusyChange,
  player,
  subjectId,
  scope,
  voices,
  userProjects,
  currentProjectId,
}: VoicePickerPanelProps) {
  const { t } = useTranslation('components/ReflixSubjectList');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState(currentProjectId);
  const [search, setSearch] = useState('');
  const descriptionId = useId();
  const voiceFetcher = useFetcher<{ voices: Voice[] }>();

  useEffect(() => {
    if (selectedProjectId !== currentProjectId) {
      voiceFetcher.load(
        `${href('/api/project-voices')}?${new URLSearchParams({ projectId: selectedProjectId })}`,
      );
    }
  }, [selectedProjectId, currentProjectId]);

  const displayVoices =
    selectedProjectId === currentProjectId ? voices : (voiceFetcher.data?.voices ?? []);
  const query = search.trim().toLocaleLowerCase();
  const filteredVoices = useMemo(
    () =>
      displayVoices.filter((voice) =>
        `${voice.name}\n${voice.description ?? ''}`.toLocaleLowerCase().includes(query),
      ),
    [displayVoices, query],
  );
  const selectedVoice = displayVoices.find((voice) => voice.id === selectedId);
  const isLoading = selectedProjectId !== currentProjectId && voiceFetcher.state === 'loading';

  const mutation = useProjectMutation({
    onError(message) {
      toast.error(message);
    },
    onSuccess: () => {
      player.stop();
      if (confirmLabel) toast.success(t(($) => $.review.saved));
    },
  });
  const isBinding = mutation.isPending;
  const unchanged =
    !!selectedVoice &&
    !!assignedVoiceIds?.length &&
    assignedVoiceIds.every((id) => id === selectedVoice.voiceId);

  useEffect(() => onBusyChange(isBinding), [isBinding, onBusyChange]);

  const handleConfirm = () => {
    if (!selectedVoice || isLoading || isBinding) return;
    onRequestChange(() => {
      mutation.bindVoice({ voiceDbId: selectedVoice.id, subjectId, scope });
    });
  };

  const handleProjectChange = (projectId: string) => {
    player.stop();
    setSelectedProjectId(projectId);
    setSelectedId(null);
    setSearch('');
  };

  return (
    <fieldset disabled={isBinding} className='voice-picker-editor flex h-full min-h-0 min-w-0 flex-col gap-3 p-1'>
      <div className='flex shrink-0 flex-col gap-2 sm:flex-row'>
        {(!confirmLabel || userProjects.length > 1) && (
          <Select value={selectedProjectId} onValueChange={handleProjectChange}>
            <SelectTrigger
              aria-label={t(($) => $.voicePickerDialog.projectLabel)}
              disabled={isBinding}
              className='w-full sm:max-w-48'
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {userProjects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <SearchInput
          className='min-w-0 flex-1'
          aria-label={t(($) => $.voicePickerDialog.search)}
          placeholder={t(($) => $.voicePickerDialog.search)}
          value={search}
          onChange={(event) => {
            player.stop();
            setSearch(event.target.value);
          }}
        />
      </div>
      <div className='min-h-0 flex-1 overflow-hidden rounded-lg border'>
        {isLoading ? (
          <div className='flex h-full items-center justify-center'>
            <LucideLoader2 className='size-8 animate-spin' />
          </div>
        ) : filteredVoices.length === 0 ? (
          <div
            role='status'
            className='text-secondary flex h-full items-center justify-center p-4 text-center text-sm'
          >
            {displayVoices.length === 0
              ? t(($) => $.voicePickerDialog.empty)
              : t(($) => $.voicePickerDialog.noResults)}
          </div>
        ) : (
          <Virtuoso
            key={`${selectedProjectId}:${query}`}
            style={{ height: '100%' }}
            data={filteredVoices}
            defaultItemHeight={confirmLabel ? 48 : 64}
            computeItemKey={(_index, voice) => voice.id}
            itemContent={(_index, voice) => (
              <div
                style={{ height: confirmLabel ? 48 : 64 }}
                className={`flex items-center gap-2 border-b px-2 ${selectedId === voice.id ? 'bg-background-200' : 'hover:bg-background-100'}`}
              >
                <Button
                  variant='ghost'
                  size='sm'
                  icon
                  disabled={!voice.previewUrl || isBinding}
                  aria-label={t(($) => $.voicePickerDialog.previewVoice, { name: voice.name })}
                  aria-pressed={player.isPlaying(voice.previewUrl)}
                  onClick={() => player.play(voice.previewUrl)}
                >
                  {player.isPlaying(voice.previewUrl) ? (
                    <LucidePause className='size-4' />
                  ) : (
                    <LucidePlay className='size-4' />
                  )}
                </Button>
                <button
                  type='button'
                  className='flex h-full min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md px-1 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 disabled:cursor-default disabled:opacity-50'
                  aria-label={voice.name}
                  aria-describedby={voice.description ? `${descriptionId}-${voice.id}` : undefined}
                  aria-pressed={selectedId === voice.id}
                  disabled={isBinding}
                  onClick={() => setSelectedId(voice.id)}
                >
                  <span className='min-w-0 flex-1'>
                    <span className='block truncate text-sm font-medium' title={voice.name}>
                      {voice.name}
                    </span>
                    {voice.description && (
                      <span
                        id={`${descriptionId}-${voice.id}`}
                        className='text-secondary block truncate text-xs'
                        title={voice.description}
                      >
                        {voice.description}
                      </span>
                    )}
                  </span>
                  {voice.source && (
                    <Badge variant='secondary' className='max-w-24 shrink-0'>
                      <span className='truncate'>{voice.source}</span>
                    </Badge>
                  )}
                  <span className='size-4 shrink-0'>
                    {selectedId === voice.id && <LucideCheck className='text-secondary size-4' />}
                  </span>
                </button>
              </div>
            )}
          />
        )}
      </div>
      <DialogFooter className='voice-editor-footer shrink-0 items-center border-t pt-3'>
        {footerLeading?.('picker')}
        {selectedVoice && (
          <span
            className='text-secondary min-w-0 flex-1 truncate text-sm'
            title={selectedVoice.name}
          >
            {t(($) => $.voicePickerDialog.selectedVoice, { name: selectedVoice.name })}
          </span>
        )}
        <Button
          variant='primary'
          disabled={!selectedVoice || isLoading || isBinding || unchanged}
          onClick={handleConfirm}
        >
          {isBinding && <LucideLoader2 className='spin size-4' />}
          {confirmLabel ?? t(($) => $.flow.applyVoice)}
        </Button>
      </DialogFooter>
    </fieldset>
  );
}
