import { SubjectVoiceDialog } from './subject-voice-dialog';
import type { Voice } from './types/voice';
import './subject-card-interactions.css';
import { Badge } from '@repo/ui/component/badge';
import { Button } from '@repo/ui/component/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/component/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/component/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/component/tabs';
import { Textarea } from '@repo/ui/component/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@repo/ui/component/tooltip';
import { SubjectEditorImage } from './subject-editor-image';
import { SubjectUploadPanel } from './subject-upload-panel';
import { Input } from '@repo/ui/component/input';
import { toast } from '@repo/ui/component/toaster';
import imageCompression from 'browser-image-compression';
import { LucideImagePlus, LucideLoader2, LucideUpload } from 'lucide-react';
import { useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { SubjectLayoutStudyContext } from './subject-layout-study';
import { SubjectStudyHistory } from './subject-study-history';
import { useTranslation } from 'react-i18next';
import { useProjectMutation } from '~/modules/project/use-project-mutation';
import { SubjectImageHistory } from './subject-image-history';
import type { Subject } from './types/subject';
import { REFERENCE_MODELS, SubjectReferencePicker, useSubjectReference } from './subject-reference-picker';
import type { z } from 'zod';
import type { addSubjectSchema } from '~/modules/project/project-contract';

const MODEL_LABELS: Record<string, string> = {
  'z-image': 'Z Image',
  seedream: 'Seedream 5.0',
  'nano-banana': 'Nano Banana',
  'nano-banana-pro': 'Nano Banana Pro',
  wan: 'Wan',
  'gpt-image-2': 'GPT Image 2',
};

export function SubjectImageDialog({
  subject,
  projectId,
  parentImageUrl,
  onClose,
  onReturnFocus,
  embedded = false,
  initialTab = 'regenerate',
  draftPrompt,
  onPromptChange,
  onBusyChange,
  onPreviewChange,
  appearances = [subject],
  onSelectSubject,
  voices,
  userProjects = [],
  reflixId,
  create = false,
  onCreated,
}: {
  subject: Subject;
  projectId: string;
  parentImageUrl?: string | null;
  onClose: () => void;
  onReturnFocus?: () => void;
  embedded?: boolean;
  initialTab?: string;
  draftPrompt?: string;
  onPromptChange?: (prompt: string) => void;
  onBusyChange?: (busy: boolean) => void;
  onPreviewChange?: (url: string | null) => void;
  appearances?: Subject[];
  onSelectSubject?: (subject: Subject) => void;
  voices?: Voice[];
  userProjects?: { id: string; name: string }[];
  reflixId?: string;
  create?: boolean;
  onCreated?: (subjectId: string) => void;
}) {
  const { t } = useTranslation('components/ReflixSubjectList');
  const layoutStudy = useContext(SubjectLayoutStudyContext);
  const draftKey = `reela-prompt-draft:${projectId}:${subject.id}`;
  const [prompt, setPrompt] = useState(() => {
    if (embedded) return draftPrompt ?? subject.imagePrompt ?? '';
    try {
      return localStorage.getItem(draftKey) ?? subject.imagePrompt ?? '';
    } catch {
      return subject.imagePrompt ?? '';
    }
  });
  const [activeTab, setActiveTab] = useState(initialTab);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('character');
  const [finalUpload, setFinalUpload] = useState<File | null>(null);
  const [finalUploadUrl, setFinalUploadUrl] = useState<string | null>(null);
  useEffect(() => {
    return () => { if (finalUploadUrl) URL.revokeObjectURL(finalUploadUrl); };
  }, [finalUploadUrl]);
  const initialSubjectId = useRef(subject.id);
  const actionRef = useRef<'regenerate' | 'upload' | 'history'>('regenerate');
  const [model, setModel] = useState(parentImageUrl ? 'seedream' : 'gpt-image-2');
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [switchingId, setSwitchingId] = useState<number | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<number | null>(null);
  const selectedImage = subject.images.find(
    (image) => image.id === selectedImageId && !image.isCurrent,
  );
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const subjectName = subject.displayName || subject.name;
  const imageUrl = subject.previewUrl || subject.previewWithNameUrl;
  const reference = useSubjectReference({ subjectId: subject.id, parentImageUrl, currentImageUrl: imageUrl });
  const displayedImage = activeTab === 'upload' && finalUploadUrl ? finalUploadUrl : create
    ? activeTab === 'upload' ? null : reference.preview
    : (activeTab === 'history' || layoutStudy) && selectedImage ? selectedImage.url : imageUrl;
  const models = reference.value
    ? REFERENCE_MODELS
    : ['z-image', 'seedream', 'nano-banana', 'nano-banana-pro', 'wan', 'gpt-image-2'];
  const mutation = useProjectMutation({
    onSettled: () => setUploading(false),
    onError(message) {
      toast.error(message);
      setSwitchingId(null);
      if (actionRef.current === 'history' && layoutStudy) {
        setSelectedImageId(null); onPreviewChange?.(null);
      }
    },
    onSuccess(data) {
      const generationError = 'generationError' in data ? data.generationError : undefined;
      if (generationError) toast.error(generationError);
      else if ('message' in data && data.message) toast.success(data.message);
      if (actionRef.current === 'regenerate' && !generationError) {
        try {
          localStorage.removeItem(draftKey);
        } catch {}
      }
      if (create && 'subjectId' in data && typeof data.subjectId === 'string') onCreated?.(data.subjectId);
      if (actionRef.current === 'history' && layoutStudy) {
        setSwitchingId(null);
        return;
      }
      onClose();
    },
  });
  const [voiceBusy, setVoiceBusy] = useState(false);
  const loading = uploading || mutation.isPending || voiceBusy || reference.preparing;
  useEffect(() => {
    if (reference.value && !REFERENCE_MODELS.includes(model)) setModel('gpt-image-2');
  }, [reference.value, model]);
  useLayoutEffect(() => {
    if (initialSubjectId.current === subject.id) return;
    initialSubjectId.current = subject.id;
    let saved = subject.imagePrompt ?? '';
    try {
      if (!embedded) saved = localStorage.getItem(draftKey) ?? saved;
    } catch {}
    setPrompt(embedded ? (draftPrompt ?? saved) : saved);
    setModel(parentImageUrl ? 'seedream' : 'gpt-image-2');
    setSelectedImageId(null);
    setSwitchingId(null);
    setImageSize(null);
    setFinalUpload(null);
    setFinalUploadUrl(null);
    if (activeTab === 'upload') setActiveTab('regenerate');
    onPreviewChange?.(null);
  }, [subject.id, draftKey, embedded, draftPrompt, parentImageUrl, onPreviewChange]);

  useEffect(() => {
    onBusyChange?.(loading);
  }, [loading, onBusyChange]);

  const uploadImage = async (file: File) => {
    if (loading) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size) {
      toast.error(t(($) => $.flow.imageInvalid));
      return;
    }
    setUploading(true);
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 2,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        fileType: file.type === 'image/png' ? 'image/png' : 'image/jpeg',
      });
      const ready = new File([compressed], file.name, { type: compressed.type });
      setFinalUpload(ready);
      setFinalUploadUrl(URL.createObjectURL(ready));
      setImageSize(null);
      setSelectedImageId(null);
      setActiveTab('upload');
      setUploading(false);
    } catch {
      setUploading(false);
      toast.error(t(($) => $.imageDialog.uploadFailed));
    }
  };

  const chooseUploadFiles = (files: File[]) => {
    if (files.length > 1) { toast.error(t(($) => $.flow.singleImage)); return; }
    if (files[0]) void uploadImage(files[0]);
  };
  const clearUpload = () => {
    setFinalUpload(null); setFinalUploadUrl(null); setImageSize(null);
    onPreviewChange?.(null);
  };

  const applySelectedImage = () => {
    if (!selectedImage || loading) return;
    actionRef.current = 'history';
    setSwitchingId(selectedImage.id);
    mutation.switchSubjectImage({ subjectId: subject.id, imageId: selectedImage.id });
  };

  return (
    <ImageEditorFrame
      embedded={embedded}
      create={create}
      title={create ? t(($) => $.addYourSubject.title) : `${subjectName} - ${activeTab === 'voice' ? t(($) => $.voice) : t(($) => $.imageDialog.title)}`}
      onClose={onClose}
      onReturnFocus={onReturnFocus}
      busy={loading}
      layoutStudy={layoutStudy}
      preview={
        <>
          <div className='subject-editor-preview-card'>
          <strong>
            {activeTab === 'upload' && finalUpload ? t(($) => $.flow.pendingImage) : create ? activeTab === 'regenerate' && reference.preview ? t(($) => $.reference.preview) : t(($) => $.creation.preview) : activeTab === 'history' && selectedImage
              ? t(($) => $.imageDialog.historyTab)
              : t(($) => $.browser.currentImage)}
          </strong>
          <SubjectEditorImage
            src={displayedImage}
            alt={create ? t(($) => $.creation.preview) : activeTab === 'upload' && finalUpload ? t(($) => $.flow.pendingImage) : t(($) => $.regenDialog.originalImage)}
            onImageSize={setImageSize}
            empty={<span className='subject-creation-empty'>
              {create && <LucideImagePlus aria-hidden='true' />}
              {create ? activeTab === 'upload' ? t(($) => $.creation.uploadTab) : t(($) => $.creation.emptyPreview) : t(($) => $.review.noImage)}
            </span>}
          />
          </div>
          {appearances.length > 1 && (
            <div
              className='subject-editor-appearances'
              role='group'
              aria-label={t(($) => $.review.appearances)}
            >
              <div className='subject-appearance-caption'>
                <span>{t(($) => $.review.appearances)}</span>
                <span>
                  {appearances.findIndex((s) => s.id === subject.id) + 1} / {appearances.length}
                </span>
              </div>
              <div className='subject-appearance-scroll'>
                {appearances.map((s) => (
                  <Tooltip key={s.id} delayDuration={150} disableHoverableContent>
                  <TooltipTrigger asChild onFocus={(event) => event.preventDefault()}>
                  <button
                    type='button'
                    disabled={loading}
                    aria-label={t(($) => $.browser.selectAppearance, {
                      name: s.displayName || s.name,
                    })}
                    aria-pressed={s.id === subject.id}
                    onClick={() => {
                      if (!loading) onSelectSubject?.(s);
                    }}
                  >
                    {s.previewUrl || s.previewWithNameUrl ? (
                      <img
                        src={s.previewUrl || s.previewWithNameUrl || undefined}
                        alt=''
                        loading='lazy'
                      />
                    ) : (
                      <span className='subject-editor-empty-thumb'>—</span>
                    )}
                  </button>
                  </TooltipTrigger>
                  <TooltipContent noArrow side='top' sideOffset={8} className='subject-appearance-name-tooltip'>
                    {s.displayName || s.name}
                  </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>
          )}
        </>
      }
    >
      <input
        ref={fileInputRef}
        type='file'
        accept='image/png,image/jpeg,image/webp'
        className='hidden'
        aria-label={t(($) => $.uploadImage)}
        disabled={loading}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = '';
          chooseUploadFiles(files);
        }}
      />
      {create && <CreationFields name={name} onNameChange={setName} category={category}
        onCategoryChange={setCategory} disabled={loading} />}
      <Tabs
        value={activeTab}
        className='flex-1'
        onValueChange={(value) => {
          setActiveTab(value);
          onPreviewChange?.(null);
        }}
      >
        <TabsList className='self-start'>
          <TabsTrigger disabled={voiceBusy} value='regenerate'>{create ? t(($) => $.creation.generateTab) : t(($) => $.imageDialog.title)}</TabsTrigger>
          {(create || activeTab === 'upload' || finalUpload) && (
            <TabsTrigger disabled={loading} value='upload'>{t(($) => $.creation.uploadTab)}</TabsTrigger>
          )}
          {!create && !layoutStudy && <TabsTrigger disabled={voiceBusy} value='history'>{t(($) => $.imageDialog.historyTab)}</TabsTrigger>}
          {voices &&
            ['character', 'voice_only_speaker'].includes(subject.category?.toLowerCase() ?? '') && (
              <TabsTrigger disabled={loading} value='voice'>
                {t(($) => $.voice)}
              </TabsTrigger>
            )}
        </TabsList>
        <TabsContent
          value='regenerate'
          className='data-[state=active]:flex data-[state=active]:flex-col'
        >
          <form
            className='subject-generation-form flex flex-1 flex-col gap-3'
            onSubmit={(event) => {
              event.preventDefault();
              if (!loading && (!create || name.trim())) {
                actionRef.current = 'regenerate';
                const data = new FormData(event.currentTarget);
                if (reference.values.length > 1) {
                  reference.values.forEach(value => data.append('referenceImages', value));
                } else data.set('parentImage', reference.value ?? '');
                if (create) {
                  mutation.addSubjects({ mode: 'generate', reflixId: reflixId || projectId,
                    name, category, imagePrompt: prompt,
                    model: model as z.input<typeof addSubjectSchema>['model'],
                    ...(reference.values.length > 1 ? { referenceImages: reference.values } : { parentImage: reference.value }), imageWidth: 1600, imageHeight: 900 });
                } else mutation.regenSubject(data);
              }
            }}
          >
            <input type='hidden' name='projectId' value={projectId} />
            <input type='hidden' name='subjectDbId' value={subject.id} />
            <input type='hidden' name='subjectId' value={subject.subjectId} />
            <input type='hidden' name='displayName' value={subject.displayName || ''} />
            <input type='hidden' name='imageWidth' value={imageSize?.width ?? 1600} />
            <input type='hidden' name='imageHeight' value={imageSize?.height ?? 900} />
            <div className='subject-editor-toolbar'>
            <SubjectReferencePicker reference={reference} parentImageUrl={parentImageUrl}
              currentImageUrl={imageUrl} disabled={loading} />
            <label className='subject-editor-settings flex items-center gap-2'>
              <div className='w-20'>{t(($) => $.regenDialog.model)}</div>
              <Select disabled={loading} value={model} onValueChange={setModel} name='model'>
                <SelectTrigger size='sm'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {models.map((value) => (
                    <SelectItem key={value} value={value}>
                      {MODEL_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            </div>
            <label className='subject-editor-prompt block'>
              <div>{t(($) => $.regenDialog.prompt)}</div>
              <Textarea
                name='imagePrompt'
                value={prompt}
                onChange={(event) => {
                  setPrompt(event.target.value);
                  if (!embedded) {
                    try {
                      localStorage.setItem(draftKey, event.target.value);
                    } catch {}
                  }
                  onPromptChange?.(event.target.value);
                }}
                disabled={loading}
                rows={10}
                className='max-h-80 resize-y overflow-y-auto'
                required
              />
            </label>
            {layoutStudy && !create && <SubjectStudyHistory
              key={subject.id}
              images={subject.images}
              selectedImageId={selectedImageId}
              loading={loading || switchingId !== null}
              onSelect={id => {
                if (loading || switchingId !== null) return;
                const image = subject.images.find(image => image.id === id);
                if (!image || image.isCurrent) return;
                setSelectedImageId(id);
                actionRef.current = 'history';
                setSwitchingId(id);
                mutation.switchSubjectImage({ subjectId: subject.id, imageId: id });
              }}
              onReference={url => reference.useImage(url)}
              referenceUrls={reference.values.filter((value): value is string => typeof value === 'string')}
            />}
            {!embedded && !layoutStudy && (
              <p className='subject-prompt-draft-note'>{create ? t(($) => $.creation.promptDraft) : t(($) => $.browser.promptDraft)}</p>
            )}
            {embedded && (
              <div className='flex flex-wrap gap-2'>
                {imageUrl && (
                  <div className='bg-background-200 relative aspect-video max-w-xs overflow-hidden rounded-xl'>
                    <img
                      src={imageUrl}
                      alt={t(($) => $.regenDialog.originalImage)}
                      className='h-full w-full object-contain'
                      onLoad={(event) => {
                        const { naturalWidth, naturalHeight } = event.currentTarget;
                        setImageSize({ width: naturalWidth, height: naturalHeight });
                      }}
                    />
                    <Badge className='absolute top-1 left-1'>
                      {t(($) => $.regenDialog.originalImage)}
                    </Badge>
                  </div>
                )}
              </div>
            )}
            <DialogFooter className='mt-auto'>
              <Button
                type='button'
                disabled={loading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? <LucideLoader2 className='spin' /> : <LucideUpload />}
                <span className='subject-editor-upload-label'>{t(($) => $.uploadImage)}</span>
              </Button>
              <Button variant='primary' type='submit' disabled={loading || (create && !name.trim())}>
                {create ? t(($) => $.creation.generate) : t(($) => $.regenerate)}
                {mutation.isPending && !uploading && <LucideLoader2 className='spin' />}
              </Button>
            </DialogFooter>
          </form>
        </TabsContent>
          <TabsContent value='upload' className='data-[state=active]:flex data-[state=active]:flex-col'>
            <form className='subject-creation-upload-form flex flex-1 flex-col gap-4' onSubmit={(event) => {
              event.preventDefault();
              if (!loading && finalUpload && (!create || name.trim())) {
                actionRef.current = 'upload';
                if (create) mutation.addSubjects({ reflixId: reflixId || projectId, name, category, image: finalUpload });
                else mutation.updateSubjects({ subjectId: subject.id, image: finalUpload });
              }
            }}>
              <SubjectUploadPanel file={finalUpload} size={imageSize} disabled={loading}
                onChoose={() => fileInputRef.current?.click()} onFiles={chooseUploadFiles} onRemove={clearUpload} />
              <DialogFooter className='mt-auto'>
                <Button type='button' disabled={loading} onClick={() => {
                  clearUpload(); if (create) onClose(); else setActiveTab('regenerate');
                }}>
                  {t(($) => $.flow.uploadCancel)}
                </Button>
                <Button type='submit' variant='primary' disabled={loading || !finalUpload || (create && !name.trim())}>
                  {mutation.isPending && <LucideLoader2 className='spin' />}
                  {create ? t(($) => $.creation.saveUpload) : t(($) => $.flow.uploadApply)}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
        {!create && <TabsContent
          value='history'
          className='data-[state=active]:flex data-[state=active]:flex-col data-[state=active]:gap-4'
        >
          <SubjectImageHistory
            subjectName={subjectName}
            images={subject.images}
            loading={loading}
            switchingId={switchingId}
            selectedImageId={selectedImage?.id ?? null}
            onSelect={(id) => {
              setSelectedImageId(id);
              onPreviewChange?.(subject.images.find((image) => image.id === id)?.url ?? null);
            }}
          />
          <DialogFooter className='mt-auto'>
            <Button
              type='button'
              variant='primary'
              disabled={!selectedImage || loading}
              onClick={applySelectedImage}
            >
              {t(($) => $.imageDialog.confirmReplace)}
              {switchingId !== null && <LucideLoader2 className='spin' />}
            </Button>
          </DialogFooter>
        </TabsContent>}
        {voices && (
          <TabsContent value='voice' className='subject-modal-voice'>
            <SubjectVoiceDialog
              embedded
              key={subject.id}
              subject={subject}
              rootSubject={appearances[0]}
              affectedSubjects={appearances}
              scope={appearances.length > 1 ? 'subtree' : 'subject'}
              hasBoundVoice={appearances.some((s) => !!s.voice)}
              projectId={projectId}
              reflixId={reflixId || ''}
              voices={voices}
              userProjects={userProjects}
              onBusyChange={setVoiceBusy}
            />
          </TabsContent>
        )}
      </Tabs>
    </ImageEditorFrame>
  );
}

function CreationFields({ name, onNameChange, category, onCategoryChange, disabled }: {
  name: string;
  onNameChange: (value: string) => void;
  category: string;
  onCategoryChange: (value: string) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation('components/ReflixSubjectList');
  return (
    <div className='subject-creation-fields'>
      <label>
        <span>{t(($) => $.creation.name)}</span>
        <Input value={name} disabled={disabled} required maxLength={100}
          onChange={(event) => onNameChange(event.target.value)} />
      </label>
      <label>
        <span>{t(($) => $.creation.category)}</span>
        <Select value={category} disabled={disabled} onValueChange={onCategoryChange}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value='character'>{t(($) => $.character)}</SelectItem>
            <SelectItem value='environment'>{t(($) => $.environment)}</SelectItem>
            <SelectItem value='prop'>{t(($) => $.prop)}</SelectItem>
          </SelectContent>
        </Select>
      </label>
    </div>
  );
}

function ImageEditorFrame({
  embedded,
  create,
  title,
  onClose,
  onReturnFocus,
  busy,
  children,
  preview,
  layoutStudy,
}: {
  embedded: boolean;
  create: boolean;
  title: string;
  onClose: () => void;
  onReturnFocus?: () => void;
  busy: boolean;
  children: ReactNode;
  preview: ReactNode;
  layoutStudy: 'compact' | 'results' | 'canvas' | null;
}) {
  if (embedded)
    return (
      <section className='review-image-editor' aria-label={title}>
        {children}
      </section>
    );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent aria-describedby={undefined} data-workbench-study={layoutStudy ?? undefined}
        onCloseAutoFocus={(event) => { if (onReturnFocus) { event.preventDefault(); onReturnFocus(); } }}
        className={`subject-image-dialog${create ? ' subject-creation-dialog' : ''}`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className='subject-editor-layout'>
          <aside className='subject-editor-preview'>{preview}</aside>
          <div className='subject-editor-body'>{children}</div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
