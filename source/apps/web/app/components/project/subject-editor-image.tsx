import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

type Dimensions = { width: number; height: number };

/** Size the photo card itself to the image ratio, rather than letterboxing a fixed frame. */
export function SubjectEditorImage({ src, alt, onImageSize, empty }: {
  src?: string | null;
  alt: string;
  onImageSize: (size: Dimensions) => void;
  empty: ReactNode;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState<Dimensions | null>(null);
  const [loaded, setLoaded] = useState<(Dimensions & { src: string }) | null>(null);
  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => setBounds({ width: element.clientWidth, height: element.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const ratio = loaded && loaded.src === src && loaded.height > 0 ? loaded.width / loaded.height : 16 / 9;
  const width = bounds && bounds.width > 0 && bounds.height > 0
    ? Math.min(bounds.width, bounds.height * ratio) : undefined;
  return (
    <div ref={stage} className='subject-editor-image-stage'>
      <div className='subject-editor-large-image' style={src ? {
        width: width ?? '100%', height: width ? width / ratio : '100%', aspectRatio: ratio,
      } : { width: '100%', height: '100%' }}>
        {src ? <img src={src} alt={alt} onLoad={(event) => {
          const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
          setLoaded({ src, width, height });
          onImageSize({ width, height });
        }} /> : empty}
      </div>
    </div>
  );
}
