import { Button } from '@repo/ui/component/button';
import { LucideImagePlus, LucideUpload, LucideX } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export function SubjectUploadPanel({ file, size, disabled, onChoose, onFiles, onRemove }: {
  file: File | null;
  size: { width: number; height: number } | null;
  disabled: boolean;
  onChoose: () => void;
  onFiles: (files: File[]) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation('components/ReflixSubjectList');
  const [dragging, setDragging] = useState(false);
  return <div className='subject-upload-panel'>
    <button type='button' disabled={disabled} className='subject-upload-drop'
      data-dragging={dragging}
      onClick={onChoose}
      onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={event => {
        event.preventDefault(); setDragging(false);
        if (!disabled) onFiles(Array.from(event.dataTransfer.files));
      }}>
      {file ? <LucideUpload /> : <LucideImagePlus />}
      <strong>{file ? t(($) => $.flow.uploadChange) : t(($) => $.flow.uploadDrop)}</strong>
      <span>{t(($) => $.flow.uploadFormats)}</span>
    </button>
    {file && <div className='subject-upload-file' role='status'>
      <div><strong title={file.name}>{file.name}</strong>
        <span>{size && `${size.width} × ${size.height} · `}{(file.size / 1024).toFixed(1)} KB · {t(($) => $.flow.fileReady)}</span>
      </div>
      <Button type='button' size='sm' variant='ghost' disabled={disabled}
        aria-label={t(($) => $.flow.removeImage)} onClick={onRemove}><LucideX /></Button>
    </div>}
  </div>;
}
