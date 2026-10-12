import { useState } from 'react';
import { LucideArrowUpRight, LucideCheck, LucideImagePlus } from 'lucide-react';
import type { SubjectImage } from './types/subject';
import { Tooltip, TooltipContent, TooltipTrigger } from '@repo/ui/component/tooltip';

/** Real image versions for the local layout comparison; selecting a version immediately uses it. */
export function SubjectStudyHistory({ images, selectedImageId, loading, onSelect, onReference, referenceUrls }: {
  images: SubjectImage[];
  selectedImageId: number | null;
  loading: boolean;
  onSelect: (id: number) => void;
  onReference: (url: string) => void;
  referenceUrls: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const selected = images.find(image => image.id === selectedImageId);
  const preview = selected ?? images.find(image => image.isCurrent);
  const ordered = [...images].sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent)
    || (Date.parse(b.ctime ?? '') || 0) - (Date.parse(a.ctime ?? '') || 0));
  const recent = ordered.slice(0, 4);
  if (selected && recent.length === 4 && !recent.some(image => image.id === selected.id)) recent[3] = selected;
  const visible = expanded ? ordered : recent;
  return <section className='study-history' aria-label='图片版本' data-image-count={images.length}>
    <div className='study-history-heading'>
      <strong>图片版本 <span>{images.length}</span></strong>
      {images.length > 4 && <button type='button' aria-expanded={expanded}
        onClick={() => setExpanded(value => !value)}>{expanded ? '收起' : '查看全部'} <LucideArrowUpRight /></button>}
    </div>
    <div className={`study-history-images${expanded ? ' is-expanded' : ''}`}>
      {visible.map(image => <Tooltip key={image.id} delayDuration={150}>
        <TooltipTrigger asChild>
          <button type='button' className='study-history-image' disabled={loading}
            aria-label={`使用图片版本 ${ordered.indexOf(image) + 1}${image.isCurrent ? '，已应用' : ''}`}
            aria-pressed={preview?.id === image.id} onClick={() => onSelect(image.id)}>
            <img src={image.url} alt='' loading='lazy' />
            {image.isCurrent && <span className='study-image-applied'><LucideCheck /></span>}
          </button>
        </TooltipTrigger>
        <TooltipContent className='study-tooltip'>
          {image.isCurrent ? '已应用的图片' : `图片版本 ${ordered.indexOf(image) + 1}`}
          {image.ctime && ` · ${new Date(image.ctime).toLocaleDateString('zh-CN')}`}
        </TooltipContent>
      </Tooltip>)}
      {images.length === 0 && <span className='study-history-empty'>生成或上传后，图片版本会显示在这里</span>}
    </div>
    <div className='study-history-actions'>
      <button type='button' disabled={loading || !preview || referenceUrls.includes(preview.url)} onClick={() => preview && onReference(preview.url)}>
        <LucideImagePlus /> 用作参考
      </button>

    </div>
  </section>;
}
