import { Button } from '@repo/ui/component/button';
import { SearchInput } from '@repo/ui/component/search-input';
import { Card } from '@repo/ui/component/card';
import {
  Dialog,
  DialogClose,
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
import { toast } from '@repo/ui/component/toaster';
import { LucideCheck, LucideImages, LucideLoader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { href, useFetcher } from 'react-router';
import { useProjectMutation } from '~/modules/project/use-project-mutation';
import { useTranslation } from 'react-i18next';
import { getSourceProjects } from './subject-picker-dialog-utils';

type LibrarySubject = {
  id: string;
  name: string;
  category: string;
  subjectId: string;
  previewUrl: string | null;
};

type SubjectPickerResponse = {
  projectId: string | null;
  subjects: LibrarySubject[];
};

type SubjectPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentProjectId: string;
  targetReflixId: string;
  userProjects: { id: string; name: string }[];
  onCreateFromUpload?: () => void;
};

export function SubjectPickerDialog({
  open,
  onOpenChange,
  currentProjectId,
  targetReflixId,
  userProjects,
  onCreateFromUpload,
}: SubjectPickerDialogProps) {
  const { t } = useTranslation('components/ReflixSubjectList');
  const sourceProjects = useMemo(
    () => getSourceProjects(userProjects, currentProjectId),
    [currentProjectId, userProjects],
  );
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<Set<string>>(() => new Set());
  const subjectFetcher = useFetcher<SubjectPickerResponse>();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');

  const loadProjectSubjects = (projectId: string) => {
    const query = new URLSearchParams({ projectId });
    subjectFetcher.load(`${href('/api/project-subjects')}?${query}`);
  };

  useEffect(() => {
    if (!open) return;

    const firstProjectId = sourceProjects[0]?.id ?? '';
    setSelectedProjectId(firstProjectId);
    setSelectedSubjectIds(new Set());
    setSearch(''); setCategory('all');
    if (firstProjectId) {
      loadProjectSubjects(firstProjectId);
    }
  }, [open, sourceProjects]);

  const subjects =
    subjectFetcher.data?.projectId === selectedProjectId ? subjectFetcher.data.subjects : [];
  const categoryLabel = (value: string) => value.toLowerCase() === 'character' ? t(($) => $.character) : value.toLowerCase() === 'environment' ? t(($) => $.environment) : value.toLowerCase() === 'prop' ? t(($) => $.prop) : value;
  const filteredSubjects = subjects.filter(subject => (category === 'all' || subject.category.toLowerCase() === category) && subject.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const isLoading =
    selectedProjectId !== '' &&
    (subjectFetcher.state === 'loading' || subjectFetcher.data?.projectId !== selectedProjectId);

  const importMutation = useProjectMutation({
    onError(message) {
      toast.error(message);
    },
    onSuccess(data) {
      if ('message' in data && data.message) {
        toast.success(data.message);
      }
      onOpenChange(false);
    },
  });

  const handleProjectChange = (projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedSubjectIds(new Set());
    setSearch(''); setCategory('all');
    loadProjectSubjects(projectId);
  };

  const toggleSubject = (subjectId: string) => {
    setSelectedSubjectIds((current) => {
      const next = new Set(current);
      if (next.has(subjectId)) {
        next.delete(subjectId);
      } else {
        next.add(subjectId);
      }
      return next;
    });
  };

  const handleImport = () => {
    if (selectedSubjectIds.size === 0) return;
    importMutation.importSubjects({
      targetReflixId,
      sourceSubjectIds: [...selectedSubjectIds],
    });
  };

  return (
    <Dialog open={open} onOpenChange={next => { if (!importMutation.isPending) onOpenChange(next); }}>
      <DialogContent aria-describedby={undefined} className='subject-import-dialog max-w-3xl'
        data-empty={sourceProjects.length === 0}
        onInteractOutside={event => { if (importMutation.isPending) event.preventDefault(); }}
        onEscapeKeyDown={event => { if (importMutation.isPending) event.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>{t(($) => $.subjectPickerDialog.title)}</DialogTitle>
        </DialogHeader>
        {sourceProjects.length === 0 ? (
          <div className='subject-import-empty'>
            <LucideImages aria-hidden='true' />
            <strong>{t(($) => $.flow.emptyTitle)}</strong>
            <p>{t(($) => $.flow.noSources)}</p>
          </div>
        ) : (
          <>
            <p className='subject-import-hint'>{t(($) => $.flow.importHint)}</p>
            <div className='subject-import-toolbar'>
            <Select disabled={importMutation.isPending} value={selectedProjectId} onValueChange={handleProjectChange}>
              <SelectTrigger aria-label={t(($) => $.subjectPickerDialog.projectLabel)}>
                <SelectValue placeholder={t(($) => $.subjectPickerDialog.projectLabel)} />
              </SelectTrigger>
              <SelectContent>
                {sourceProjects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <SearchInput aria-label={t(($) => $.flow.importSearch)} placeholder={t(($) => $.flow.importSearch)} value={search} disabled={importMutation.isPending} onChange={event => setSearch(event.target.value)} />
            <Select value={category} onValueChange={setCategory} disabled={importMutation.isPending}>
              <SelectTrigger aria-label={t(($) => $.flow.allTypes)}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value='all'>{t(($) => $.flow.allTypes)}</SelectItem>
                {[...new Set(subjects.map(s => s.category.toLowerCase()))].map(value => <SelectItem key={value} value={value}>{categoryLabel(value)}</SelectItem>)}
              </SelectContent>
            </Select>
            </div>
            {isLoading ? (
              <div className='flex items-center justify-center py-10'>
                <LucideLoader2 className='spin size-8' />
              </div>
            ) : subjects.length === 0 ? (
              <div className='text-muted-foreground py-10 text-center text-sm'>
                {t(($) => $.subjectPickerDialog.empty)}
              </div>
            ) : filteredSubjects.length === 0 ? <div className='subject-import-empty'>
              <strong>{t(($) => $.flow.noResults)}</strong><Button onClick={() => {setSearch('');setCategory('all');}}>{t(($) => $.flow.clearSearch)}</Button>
            </div> : (
              <div className='subject-import-grid grid grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3'>
                {filteredSubjects.map((subject) => {
                  const selected = selectedSubjectIds.has(subject.id);
                  return (
                    <Card
                      key={subject.id}
                      className={`relative cursor-pointer gap-0 overflow-hidden p-0 transition ${
                        selected ? 'ring-brand ring-2' : ''
                      }`}
                      role='button'
                      tabIndex={0}
                      aria-pressed={selected}
                      aria-disabled={importMutation.isPending}
                      onClick={() => { if (!importMutation.isPending) toggleSubject(subject.id); }}
                      onKeyDown={(event) => {
                        if (!importMutation.isPending && (event.key === 'Enter' || event.key === ' ')) {
                          event.preventDefault();
                          toggleSubject(subject.id);
                        }
                      }}
                    >
                      <div className='bg-background-200 relative aspect-video shrink-0 rounded-xl overflow-hidden mx-1.5 mt-1.5'>
                        {subject.previewUrl ? (
                          <img
                            src={subject.previewUrl}
                            alt={subject.name}
                            className='h-full w-full object-cover object-top'
                            loading='lazy'
                          />
                        ) : null}
                        {selected ? (
                          <div className='bg-brand absolute top-2 right-2 rounded-full p-1 text-white'>
                            <LucideCheck className='size-4' />
                          </div>
                        ) : null}
                      </div>
                      <div className='flex min-h-0 flex-1 flex-col p-3'>
                        <div className='line-clamp-2 leading-tight font-semibold'>
                          {subject.name}
                        </div>
                        <div className='text-muted-foreground mt-auto truncate text-xs'>
                          {categoryLabel(subject.category)}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
        <DialogFooter className='subject-import-footer'>
          {sourceProjects.length > 0 && <span className='subject-import-selection'>{t(($) => $.flow.selectedCount, {count: selectedSubjectIds.size})}</span>}
          <DialogClose asChild>
            <Button disabled={importMutation.isPending}>{t(($) => $.subjectPickerDialog.cancel)}</Button>
          </DialogClose>
          {sourceProjects.length === 0 ? onCreateFromUpload && <Button variant='primary' onClick={onCreateFromUpload}>{t(($) => $.flow.createUpload)}</Button> : <Button
            variant='primary'
            disabled={selectedSubjectIds.size === 0 || importMutation.isPending}
            onClick={handleImport}
          >
            {importMutation.isPending ? <LucideLoader2 className='spin size-4' /> : null}
            {t(($) => $.flow.importCount, {count: selectedSubjectIds.size})}
          </Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
