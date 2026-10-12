import { cn } from '@repo/ui/cn';
import type { ReactNode } from 'react';
import { SubjectPlaceholderIcon } from './subject-placeholder-icon';
import type { Subject } from './types/subject';

export function SubjectPreviewStack({
  variants,
  children,
}: {
  variants: Subject[];
  children: ReactNode;
}) {
  const photoClassName =
    'overflow-hidden rounded-2xl border border-black/10 bg-background-200 shadow-[0_2px_6px_rgba(0,0,0,0.06),0_8px_18px_rgba(0,0,0,0.10)] dark:border-white/10';

  return (
    <div className='subject-preview-stack relative w-full px-1.5 pt-1.5 pb-5'>
      <div className='subject-preview-frame relative isolate aspect-video w-full'>
        {variants.slice(0, 2).map((variant, index) => {
          const preview = variant.previewUrl || variant.previewWithNameUrl;
          return (
            <div
              key={variant.id}
              aria-hidden='true'
              className={cn(
                photoClassName,
                'subject-stack-layer pointer-events-none absolute inset-0',
                index === 0
                  ? 'z-2 translate-y-3 scale-95'
                  : 'z-1 translate-y-6 scale-90',
              )}
            >
              {preview ? (
                <img
                  src={preview}
                  alt=''
                  loading='lazy'
                  className='h-full w-full object-cover object-top'
                />
              ) : (
                <div className='flex h-full items-center justify-center'>
                  <SubjectPlaceholderIcon category={variant.category} className='size-8' />
                </div>
              )}
              <span
                className='bg-card absolute inset-0'
                style={{ opacity: index === 0 ? 0.2 : 0.36 }}
              />
            </div>
          );
        })}
        <div className={cn(photoClassName, 'absolute inset-0 z-10')}>{children}</div>
      </div>
    </div>
  );
}
