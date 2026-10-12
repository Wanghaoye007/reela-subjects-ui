import { Button } from '@repo/ui/component/button';
import { DialogFooter } from '@repo/ui/component/dialog';
import { Input } from '@repo/ui/component/input';
import { Textarea } from '@repo/ui/component/textarea';
import { toast } from '@repo/ui/component/toaster';
import { LucideCheck, LucideLoader2, LucidePause, LucidePlay } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { useProjectMutation } from '~/modules/project/use-project-mutation';
import type { SubjectVoiceScope } from '~/modules/project/subject-voice-target';
import { DEFAULT_PREVIEW_TEXT } from '~/constants/voice';
import { useTranslation } from 'react-i18next';
import type { useAudioPlayer } from './use-audio-player';

type VoiceDesignPanelProps = {
  footerLeading?: (panel: string) => ReactNode;
  onRequestChange: (change: () => void) => void;
  onSaved: () => void;
  onBusyChange: (busy: boolean) => void;
  player: ReturnType<typeof useAudioPlayer>;
  subjectId: string;
  scope: SubjectVoiceScope;
  reflixId: string;
};

type Scheme = {
  voiceId: string;
  previewUrl: string;
  label: string;
};

export function VoiceDesignPanel({
  footerLeading,
  onRequestChange,
  onSaved,
  onBusyChange,
  player,
  subjectId,
  scope,
  reflixId,
}: VoiceDesignPanelProps) {
  const { t } = useTranslation('components/ReflixSubjectList');

  const [voiceName, setVoiceName] = useState('');
  const [voicePrompt, setVoicePrompt] = useState('');
  const [previewText, setPreviewText] = useState(DEFAULT_PREVIEW_TEXT);
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [selectedScheme, setSelectedScheme] = useState<string | null>(null);

  const generateMutation = useProjectMutation({
    onError(message) {
      toast.error(message);
    },
    onSuccess(data) {
      if ('voices' in data) {
        setSchemes(
          data.voices.map((v, i) => ({
            voiceId: v.voiceId,
            previewUrl: v.previewUrl,
            label: t(($) => $.voiceDesignDialog.scheme, { number: i + 1 }),
          })),
        );
      }
    },
  });

  const saveMutation = useProjectMutation({
    onError(message) {
      toast.error(message);
    },
    onSuccess() {
      player.stop();
      onSaved();
    },
  });

  const isGenerating = generateMutation.isPending;
  const isSaving = saveMutation.isPending;
  const isBusy = isGenerating || isSaving;

  useEffect(() => onBusyChange(isBusy), [isBusy, onBusyChange]);

  const handleGenerate = () => {
    setSchemes([]);
    setSelectedScheme(null);
    player.stop();
    generateMutation.generateVoiceDesign({
      prompt: voicePrompt,
      previewText,
    });
  };

  const handleSave = () => {
    const scheme = schemes.find((s) => s.voiceId === selectedScheme);
    if (!scheme || !voiceName) return;
    onRequestChange(() => {
      saveMutation.saveDesignedVoice({
        voiceId: scheme.voiceId,
        voiceName,
        prompt: voicePrompt,
        previewText,
        previewUrl: scheme.previewUrl,
        subjectId,
        scope,
        reflixId,
      });
    });
  };

  return (
    <fieldset disabled={isBusy} className='voice-design-editor flex h-full min-h-0 min-w-0 flex-col gap-3 p-1'>
      <div className='voice-design-fields min-h-0 flex-1 overflow-y-auto'>
        <label className='voice-name-field'>
          <div className='text-sm font-medium'>{t(($) => $.voiceDesignDialog.voiceName)}</div>
          <Input
            value={voiceName}
            onChange={(e) => setVoiceName(e.target.value)}
            placeholder={t(($) => $.voiceDesignDialog.voiceNamePlaceholder)}
          />
        </label>

        <div className='voice-design-workspace'>
        <label className='voice-description-field'>
          <div className='text-sm font-medium'>
            {t(($) => $.voiceDesignDialog.customDescription)}
          </div>
          <Textarea
            value={voicePrompt}
            onChange={(e) => setVoicePrompt(e.target.value)}
            placeholder={t(($) => $.voiceDesignDialog.descriptionPlaceholder)}
            rows={3}
          />
        </label>

        <label className='voice-preview-text'>
          <div className='text-sm font-medium'>
            {t(($) => $.voiceDesignDialog.previewText)}
          </div>
          <Textarea
            value={previewText}
            onChange={(e) => setPreviewText(e.target.value)}
            rows={3}
          />
        </label>
        </div>

        {isGenerating && (
          <div className='flex items-center justify-center gap-2 py-4'>
            <LucideLoader2 className='spin size-5' />
            <span className='text-muted-foreground text-sm'>
              {t(($) => $.voiceDesignDialog.generating)}
            </span>
          </div>
        )}

        {schemes.length > 0 && (
          <div className='voice-schemes'>
            {schemes.map((scheme) => (
              <div
                key={scheme.voiceId}
                className='voice-scheme'
                data-selected={selectedScheme === scheme.voiceId}
              >
                  <button type='button' className='voice-scheme-select'
                    aria-pressed={selectedScheme === scheme.voiceId}
                    onClick={() => setSelectedScheme(scheme.voiceId)}>
                    <span>{scheme.label}</span>
                    {selectedScheme === scheme.voiceId && <LucideCheck className='size-3' />}
                  </button>
                  <Button
                    variant='ghost'
                    size='sm'
                    rounded
                    aria-label={t(($) => $.voicePickerDialog.previewVoice, { name: scheme.label })}
                    aria-pressed={player.isPlaying(scheme.previewUrl)}
                    onClick={() => player.play(scheme.previewUrl)}
                  >
                    {player.isPlaying(scheme.previewUrl) ? (
                      <LucidePause className='size-4' />
                    ) : (
                      <LucidePlay className='size-4' />
                    )}
                  </Button>
              </div>
            ))}
          </div>
        )}
      </div>
      <DialogFooter className='voice-editor-footer shrink-0 flex-row justify-end border-t pt-3'>
        {footerLeading?.('design')}
        {schemes.length > 0 && (
          <Button variant='default' onClick={handleGenerate} disabled={isBusy}>
            {t(($) => $.voiceDesignDialog.regenerate)}
          </Button>
        )}
        {schemes.length === 0 ? <Button
          variant='primary'
          disabled={!voicePrompt || isBusy}
          onClick={handleGenerate}
        >
          {isGenerating && <LucideLoader2 className='spin size-4' />}
          {t(($) => $.voiceDesignDialog.generate)}
        </Button> : <Button
          variant='primary'
          disabled={!selectedScheme || !voiceName || isBusy}
          onClick={handleSave}
        >
          {isSaving && <LucideLoader2 className='spin size-4' />}
          {t(($) => $.voiceDesignDialog.save)}
        </Button>}
      </DialogFooter>
    </fieldset>
  );
}
