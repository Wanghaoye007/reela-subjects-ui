import { Button } from '@repo/ui/component/button';
import { toast } from '@repo/ui/component/toaster';
import imageCompression from 'browser-image-compression';
import { LucidePlus, LucideX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type Reference = { id: string; value: string | File; preview: string; identity: string };
export const REFERENCE_MODELS = ['seedream', 'nano-banana', 'nano-banana-pro', 'gpt-image-2'];
const MAX_REFERENCE_BYTES = 2 * 1024 * 1024;

export function useSubjectReference({
  subjectId,
  parentImageUrl,
  currentImageUrl,
}: {
  subjectId: string;
  parentImageUrl?: string | null;
  currentImageUrl?: string | null;
}) {
  const { t } = useTranslation('components/ReflixSubjectList');
  const [references, setReferences] = useState<Record<string, Reference[]>>({});
  const [preparing, setPreparing] = useState(false);
  const preparingRef = useRef(false);
  const urls = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current.clear();
    };
  }, []);
  const defaults: Reference[] = parentImageUrl
    ? [{ id: parentImageUrl, identity: parentImageUrl, value: parentImageUrl, preview: parentImageUrl }]
    : [];
  const items = references[subjectId] ?? defaults;
  const append = (next: Reference) => {
    setReferences(previous => {
      const existing = previous[subjectId] ?? defaults;
      if (existing.some(item => item.identity === next.identity)) return previous;
      return { ...previous, [subjectId]: [...existing, next] };
    });
  };
  const remove = (id: string) => {
    const item = items.find(reference => reference.id === id);
    if (item && urls.current.delete(item.preview)) URL.revokeObjectURL(item.preview);
    setReferences(previous => ({ ...previous,
      [subjectId]: (previous[subjectId] ?? defaults).filter(reference => reference.id !== id) }));
  };
  const upload = async (input: File | File[]) => {
    if (preparingRef.current) return;
    preparingRef.current = true;
    setPreparing(true);
    const identities = new Set(items.map(item => item.identity));
    try {
      for (const file of Array.isArray(input) ? input : [input]) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size === 0 || file.size > 10 * 1024 * 1024) {
          toast.error(t(($) => $.reference.invalid));
          continue;
        }
        const identity = `file:${file.name}:${file.size}:${file.type}:${file.lastModified}`;
        if (identities.has(identity)) continue;
        identities.add(identity);
        try {
          const compressed = await imageCompression(file, {
            maxSizeMB: 2, maxWidthOrHeight: 1920, useWebWorker: true, fileType: 'image/jpeg',
          });
          if (compressed.size > MAX_REFERENCE_BYTES) throw new Error('Reference too large');
          if (!mounted.current) return;
          const ready = new File([compressed], file.name, { type: compressed.type });
          const url = URL.createObjectURL(ready);
          urls.current.add(url);
          append({ id: identity, value: ready, preview: url, identity });
        } catch {
          if (mounted.current) toast.error(t(($) => $.reference.invalid));
        }
      }
    } finally {
      preparingRef.current = false;
      if (mounted.current) setPreparing(false);
    }
  };
  const useImage = (imageUrl: string) => {
    append({ id: imageUrl, identity: imageUrl, value: imageUrl, preview: imageUrl });
  };
  return { items, values: items.map(item => item.value), value: items[0]?.value,
    preview: items[0]?.preview, preparing, remove, upload, useImage };

}

export function SubjectReferencePicker({
  reference,
  disabled,
}: {
  reference: ReturnType<typeof useSubjectReference>;
  parentImageUrl?: string | null;
  currentImageUrl?: string | null;
  disabled: boolean;
}) {
  const { t } = useTranslation('components/ReflixSubjectList');
  const input = useRef<HTMLInputElement>(null);
  return (
    <section className='subject-reference-picker' aria-label={t(($) => $.reference.title)}>
      <div className='subject-reference-heading'>
        <strong>{t(($) => $.reference.title)}</strong>
      </div>
      <input ref={input} type='file' multiple accept='image/png,image/jpeg,image/webp' className='hidden'
        aria-label={t(($) => $.reference.upload)} disabled={disabled}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = '';
          if (files.length) void reference.upload(files);
        }} />
      <div className='subject-reference-selection'>
        {reference.items.map(item => (
          <div key={item.id} className='subject-reference-thumb' title={item.value instanceof File ? item.value.name : undefined}>
            <img src={item.preview} alt={t(($) => $.reference.preview)} />
            <Button type='button' variant='ghost' size='sm' disabled={disabled}
              aria-label={t(($) => $.reference.remove)} onClick={() => reference.remove(item.id)}>
              <LucideX className='size-3' />
            </Button>
          </div>
        ))}
        <Button type='button' variant='ghost' size='sm' className='subject-reference-add'
          disabled={disabled} title={t(($) => $.reference.upload)}
          onClick={() => input.current?.click()}>
          <LucidePlus className='size-5' />
          <span>{t(($) => $.reference.addImage)}</span>
        </Button>
      </div>
    </section>
  );
}
