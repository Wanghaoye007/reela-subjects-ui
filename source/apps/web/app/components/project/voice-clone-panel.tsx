import { Button } from '@repo/ui/component/button';
import { DialogFooter } from '@repo/ui/component/dialog';
import { Input } from '@repo/ui/component/input';
import { toast } from '@repo/ui/component/toaster';
import { LucideLoader2, LucidePause, LucidePlay, LucideUpload, LucideX } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useProjectMutation } from '~/modules/project/use-project-mutation';
import type { SubjectVoiceScope } from '~/modules/project/subject-voice-target';
import { useTranslation } from 'react-i18next';
import type { useAudioPlayer } from './use-audio-player';

type VoiceClonePanelProps = {
  footerLeading?: (panel: string) => ReactNode;
  onRequestChange: (change: () => void) => void;
  onSaved: () => void;
  onBusyChange: (busy: boolean) => void;
  player: ReturnType<typeof useAudioPlayer>;
  subjectId: string;
  scope: SubjectVoiceScope;
  reflixId: string;
};

export function VoiceClonePanel({
  footerLeading,
  onRequestChange,
  onSaved,
  onBusyChange,
  player,
  subjectId,
  scope,
  reflixId,
}: VoiceClonePanelProps) {
  const { t } = useTranslation('components/ReflixSubjectList');

  const [voiceName, setVoiceName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFileUrl = useRef<string | null>(null);

  const mutation = useProjectMutation({
    onError(message) {
      toast.error(message);
    },
    onSuccess() {
      player.stop();
      onSaved();
    },
  });

  const isSaving = mutation.isPending;

  useEffect(() => onBusyChange(isSaving), [isSaving, onBusyChange]);

  useEffect(() => {
    return () => {
      if (localUrl) {
        URL.revokeObjectURL(localUrl);
      }
    };
  }, [localUrl]);

  useEffect(() => {
    return () => {
      if (pendingFileUrl.current) {
        URL.revokeObjectURL(pendingFileUrl.current);
        pendingFileUrl.current = null;
      }
    };
  }, []);

  const handleFile = async (f: File) => {
    if (isSaving) return;
    const ALLOWED_EXTENSIONS = ['.mp3', '.wav', '.m4a'];
    const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      toast.error(t(($) => $.voiceCloneDialog.unsupportedFormat));
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      toast.error(t(($) => $.voiceCloneDialog.fileTooLarge));
      return;
    }

    if (pendingFileUrl.current) {
      URL.revokeObjectURL(pendingFileUrl.current);
    }
    const url = URL.createObjectURL(f);
    pendingFileUrl.current = url;
    try {
      const duration = await new Promise<number>((resolve, reject) => {
        const audio = new Audio(url);
        audio.addEventListener('loadedmetadata', () => resolve(audio.duration), { once: true });
        audio.addEventListener('error', () => reject(new Error('Failed to load audio')), {
          once: true,
        });
      });
      // Closing or selecting another file releases the pending URL and cancels this result.
      if (pendingFileUrl.current !== url) return;
      if (!Number.isFinite(duration) || duration < 10 || duration > 30) {
        toast.error(t(($) => $.voiceCloneDialog.audioDurationError));
        return;
      }
      player.stop();
      setFile(f);
      setLocalUrl(url);
      pendingFileUrl.current = null;
      if (!voiceName) {
        setVoiceName(f.name.replace(/\.[^/.]+$/, ''));
      }
    } catch {
      if (pendingFileUrl.current === url) {
        toast.error(t(($) => $.voiceCloneDialog.unsupportedFormat));
      }
    } finally {
      if (pendingFileUrl.current === url) {
        URL.revokeObjectURL(url);
        pendingFileUrl.current = null;
      }
    }
  };

  const handleClearFile = () => {
    player.stop();
    setFile(null);
    setLocalUrl(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) {
      handleFile(f);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      handleFile(f);
    }
  };

  const handleSave = () => {
    if (!file || !voiceName) return;
    onRequestChange(() => mutation.cloneVoice({ file, voiceName, subjectId, scope, reflixId }));
  };

  return (
    <fieldset disabled={isSaving} className='voice-clone-editor flex h-full min-h-0 min-w-0 flex-col gap-3 p-1'>
      <div className='min-h-0 flex-1 space-y-4 overflow-y-auto p-1'>
        <label className='voice-name-field'>
          <div className='text-sm font-medium'>{t(($) => $.voiceCloneDialog.voiceName)}</div>
          <Input
            value={voiceName}
            onChange={(e) => setVoiceName(e.target.value)}
            placeholder={t(($) => $.voiceCloneDialog.voiceNamePlaceholder)}
          />
        </label>

        {!file ? (
          <button
            type='button'
            className={`voice-clone-dropzone hover:bg-background-100 cursor-pointer rounded-xl border border-dashed text-center transition ${
              isDragOver ? 'border-brand bg-brand/5' : 'border-border'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <LucideUpload className='text-muted-foreground mx-auto mb-2 size-8' />
            <span className='block text-sm font-medium'>{t(($) => $.voiceCloneDialog.dropzone)}</span>
            <span className='text-muted-foreground mt-1 block text-xs'>
              {t(($) => $.voiceCloneDialog.dropzoneHint)}
            </span>
          </button>
        ) : (
          <div className='flex items-center gap-2'>
            <span className='flex-1 truncate text-sm'>{file.name}</span>
            <Button variant='ghost' size='sm' onClick={handleClearFile}>
              <LucideX className='size-4' />
            </Button>
            {localUrl && (
              <Button variant='ghost' size='sm' onClick={() => player.play(localUrl)}>
                {player.isPlaying(localUrl) ? (
                  <LucidePause className='size-4' />
                ) : (
                  <LucidePlay className='size-4' />
                )}
                {t(($) => $.voiceCloneDialog.preview)}
              </Button>
            )}
          </div>
        )}
        <input ref={fileInputRef} type='file'
          accept='.mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/x-wav,audio/mp4'
          className='hidden' onChange={handleFileChange} />
      </div>
      <DialogFooter className='voice-editor-footer shrink-0 flex-row justify-end border-t pt-3'>
        {footerLeading?.('clone')}
        <Button variant='primary' disabled={!file || !voiceName || isSaving} onClick={handleSave}>
          {isSaving && <LucideLoader2 className='spin size-4' />}
          {t(($) => $.flow.cloneApply)}
        </Button>
      </DialogFooter>
    </fieldset>
  );
}
