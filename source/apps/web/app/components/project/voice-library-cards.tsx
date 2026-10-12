import { Badge } from '@repo/ui/component/badge';
import { Button } from '@repo/ui/component/button';
import { Card, CardContent } from '@repo/ui/component/card';
import { LucideMic, LucidePause, LucidePlay } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Voice } from './types/voice';
import { useAudioPlayer } from './use-audio-player';

type VoiceLibraryCardsProps = {
  voices: Voice[];
};

export function VoiceLibraryCards({ voices }: VoiceLibraryCardsProps) {
  const { t } = useTranslation('components/ReflixSubjectList');
  const player = useAudioPlayer();

  if (voices.length === 0) {
    return (
      <div className='col-span-full py-10 text-center'>
        <LucideMic className='text-muted-foreground mx-auto mb-2 size-8' />
        <p className='text-muted-foreground text-sm'>{t(($) => $.voiceLibrary.empty)}</p>
      </div>
    );
  }

  return (
    <>
      {voices.map((voice) => (
        <Card key={voice.id} className='voice-library-card h-full gap-0 overflow-hidden rounded-xl p-0'>
          <CardContent className='flex flex-1 flex-col gap-0 p-0'>
            <div className='space-y-2 p-4'>
              <div className='flex items-center gap-2'>
                <h3 className='text-lg font-semibold'>{voice.name}</h3>
                {voice.source && <Badge variant='secondary'>{voice.source}</Badge>}
              </div>
              {voice.description && (
                <p className='text-muted-foreground line-clamp-3 text-sm'>{voice.description}</p>
              )}
            </div>
            {voice.previewUrl && (
              <div className='voice-library-card-actions mt-auto px-4 pb-3'>
                <Button variant='ghost' size='sm' onClick={() => player.play(voice.previewUrl)}>
                  {player.isPlaying(voice.previewUrl) ? (
                    <LucidePause className='size-4' />
                  ) : (
                    <LucidePlay className='size-4' />
                  )}
                  {player.isPlaying(voice.previewUrl)
                    ? (t(($) => $.voicePickerDialog.playing) ?? 'Playing...')
                    : (t(($) => $.voicePickerDialog.preview) ?? 'Preview')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </>
  );
}
