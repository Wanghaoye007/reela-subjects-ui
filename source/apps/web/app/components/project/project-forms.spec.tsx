import { transferableAbortController } from 'node:util';
// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import imageCompression from 'browser-image-compression';
import { createInstance } from 'i18next';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { VirtuosoMockContext } from 'react-virtuoso';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import episodeTranslations from '~/locales/en/components/ReflixEpisodesList';
import subjectTranslations from '~/locales/en/components/ReflixSubjectList';
import { projectDetailKeys } from '~/modules/query/query-keys';
import { DEFAULT_PREVIEW_TEXT } from '~/constants/voice';
import { EpisodesList } from './episodes-list';
import { SubjectList } from './subject-list';
import { SubjectReview } from './subject-review';
import { SubjectLayoutStudyContext } from './subject-layout-study';
import type { Subject } from './types/subject';

vi.mock('browser-image-compression', () => ({
  default: vi.fn(async (file: File) => file),
}));

vi.mock('~/utils/tier-config', () => ({
  getConfiguredOffpeakTier: () => null,
  getTierLabel: () => 'Lite',
  supportsOffpeak: () => false,
}));

const subject: Subject = {
  id: 'S1',
  subjectId: 'E:1',
  name: 'Room',
  displayName: 'The room',
  category: 'environment',
  description: null,
  previewUrl: 'https://example.com/room.png',
  previewWithNameUrl: null,
  imagePrompt: 'A bright room',
  voice: null,
  warning: null,
  generation: {
    activeCount: 0,
    statuses: [],
    latestCompletedTaskId: null,
    latestFailedTaskId: null,
  },
  ctime: '2026-01-01',
  images: [],
};
const subjectsData = { subjects: [subject], voices: [], userProjects: [] };
const episodesData = {
  episodes: [
    {
      id: 'E1',
      title: 'Opening',
      episodeNumber: 1,
      duration: 60,
      subjectIds: ['S1'],
    },
  ],
};
const fetchMock = vi.fn();
let queryClient: QueryClient;
let i18n: ReturnType<typeof createInstance>;
let router: ReturnType<typeof createMemoryRouter>;
let completeMutation: (response: Response) => void;

beforeEach(async () => {
  // React Router builds Node Requests; use matching native abort objects in jsdom.
  const nativeController = transferableAbortController();
  vi.stubGlobal('AbortController', nativeController.constructor);
  vi.stubGlobal('AbortSignal', nativeController.signal.constructor);
  for (const method of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture']) {
    Object.defineProperty(HTMLElement.prototype, method, {configurable: true, writable: true, value: vi.fn(() => false)});
  }
  queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  queryClient.setQueryData(projectDetailKeys.episodes('P1'), episodesData);
  queryClient.setQueryData(projectDetailKeys.subjects('P1'), subjectsData);
  i18n = createInstance();
  await i18n.init({
    lng: 'en',
    resources: {
      en: {
        'components/ReflixEpisodesList': episodeTranslations,
        'components/ReflixSubjectList': subjectTranslations,
      },
    },
    interpolation: { escapeValue: false },
  });
  localStorage.clear();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true,
    value: vi.fn(() => 'blob:reference-test') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, writable: true, value: vi.fn() });
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url.startsWith('/api/projects/') && init?.method === 'POST') {
      return new Promise<Response>((resolve) => {
        completeMutation = resolve;
      });
    }
    if (url.startsWith('/api/episode-script?'))
      return Promise.resolve(Response.json({ episodeId: 'E1', script: 'Original script' }));
    if (url.endsWith('/episodes')) return Promise.resolve(Response.json(episodesData));
    if (url.endsWith('/subjects')) return Promise.resolve(Response.json(subjectsData));
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  router?.dispose();
  queryClient.clear();
  vi.unstubAllGlobals();
});

function renderProject(element: ReactElement, sourceSubjects: Record<string, {id: string; name: string; category: string; subjectId: string; previewUrl: string | null}[]> = {}) {
  router = createMemoryRouter([{ path: '/', element }, {path: '/api/project-subjects', loader: ({request}) => {
    const projectId = new URL(request.url).searchParams.get('projectId');
    return {projectId, subjects: projectId ? sourceSubjects[projectId] ?? [] : []};
  }}]);
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <VirtuosoMockContext.Provider value={{ viewportHeight: 320, itemHeight: 64 }}>
          <RouterProvider router={router} />
        </VirtuosoMockContext.Provider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

function submittedForm() {
  const call = fetchMock.mock.calls.find(
    ([url, init]) => url.startsWith('/api/projects/') && init?.method === 'POST',
  );
  expect(call).toBeDefined();
  const init = call![1] as RequestInit;
  expect(init.headers).toBeUndefined();
  expect(init.body).toBeInstanceOf(FormData);
  return init.body as FormData;
}

describe('project mutation forms', () => {
  it('saves the edited episode script and subjects through a mutation', async () => {
    renderProject(
      <EpisodesList projectId='P1' reflixId='P1' currentTier='lite' isProcessing={false} />,
    );
    const script = await screen.findByDisplayValue('Original script');
    fireEvent.change(script, { target: { value: 'Edited script' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled());
    expect(Object.fromEntries(submittedForm())).toEqual({
      episodeId: 'E1',
      subjects: 'S1',
      script: 'Edited script',
    });

    await act(async () => completeMutation(Response.json({ message: 'Saved' })));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/P1/episodes');
  });

  it.each([false, true])(
    'submits the selected subject regeneration fields (variant: %s)',
    async (isVariant) => {
      if (isVariant) {
        queryClient.setQueryData(projectDetailKeys.subjects('P1'), {
          ...subjectsData,
          subjects: [
            {
              ...subject,
              id: 'parent',
              subjectId: 'E:0',
              name: 'Parent room',
              displayName: 'Parent room',
            },
            { ...subject, parentId: 'parent' },
          ],
        });
      }
      renderProject(<SubjectList projectId='P1' reflixId='P1' isProcessing={false} />);
      if (isVariant) {
        fireEvent.click(screen.getByRole('button', { name: 'Edit Image' }));
        fireEvent.click(screen.getByRole('button', { name: 'Switch to The room' }));
      }
      expect(screen.queryByRole('button', { name: 'Regen' })).not.toBeInTheDocument();
      const user = userEvent.setup();
      if (!isVariant) await user.click(screen.getByRole('img', { name: subject.name }));
      expect(screen.getByRole('tab', { name: 'Edit Image' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        'Edit Image',
        'History',
      ]);
      fireEvent.change(screen.getByRole('textbox', { name: 'prompt' }), {
        target: { value: 'A dark room' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Regenerate' })).toBeDisabled(),
      );
      expect(Object.fromEntries(submittedForm())).toMatchObject({
        projectId: 'P1',
        subjectDbId: 'S1',
        subjectId: 'E:1',
        displayName: 'The room',
        imagePrompt: 'A dark room',
        model: isVariant ? 'seedream' : 'gpt-image-2',
        parentImage: isVariant ? subject.previewUrl : '',
      });

      await act(async () =>
        completeMutation(
          Response.json({
            taskId: 'job-1',
            subjectId: 'S1',
            status: 'queued',
            message: 'Generation started',
          }),
        ),
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(fetchMock).toHaveBeenCalledWith('/api/projects/P1/subjects');
    },
  );
});

describe('subject image dialog', () => {
  it('uploads from the footer without submitting regeneration and blocks edits while preparing the image', async () => {
    const user = userEvent.setup();
    let finishCompression: (file: File) => void;
    vi.mocked(imageCompression).mockImplementationOnce(
      () =>
        new Promise<File>((resolve) => {
          finishCompression = resolve;
        }),
    );
    renderProject(<SubjectList projectId='P1' reflixId='P1' isProcessing={false} />);
    await user.click(screen.getByRole('button', { name: 'Edit Image' }));
    const input = screen.getByLabelText('Upload Image');
    const openFilePicker = vi.fn();
    input.addEventListener('click', openFilePicker);
    await user.click(screen.getByRole('button', { name: 'Upload Image' }));
    expect(openFilePicker).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    const file = new File(['image'], 'replacement.png', { type: 'image/png' });
    await user.upload(input, file);
    expect(screen.getByRole('button', { name: 'Upload Image' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => finishCompression(file));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('img', { name: 'Pending image' })).toHaveAttribute('src', 'blob:reference-test');
    await user.click(screen.getByRole('button', { name: 'Upload and apply' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')?.[0]).toBe(
      '/api/projects/subjects/update',
    );
    expect(submittedForm().get('subjectId')).toBe(subject.id);
    expect(submittedForm().get('image')).toBeInstanceOf(File);
    expect(screen.getByRole('button', { name: 'Upload and apply' })).toBeDisabled();
    await act(async () => completeMutation(Response.json({ message: 'Saved' })));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/P1/subjects');
  });

  it('allows retrying the same file after compression fails', async () => {
    const user = userEvent.setup();
    vi.mocked(imageCompression).mockRejectedValueOnce(new Error('Invalid image'));
    renderProject(<SubjectList projectId='P1' reflixId='P1' isProcessing={false} />);
    await user.click(screen.getByRole('button', { name: 'Edit Image' }));
    const input = screen.getByLabelText('Upload Image');
    const file = new File(['image'], 'replacement.png', { type: 'image/png' });
    await user.upload(input, file);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Upload Image' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeEnabled();
    await user.upload(input, file);
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Upload and apply' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')?.[0]).toBe(
      '/api/projects/subjects/update',
    );
    await act(async () => completeMutation(Response.json({ message: 'Saved' })));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('removes or cancels a prepared upload without writing and restores the current image', async () => {
    const user = userEvent.setup();
    renderProject(<SubjectList projectId='P1' reflixId='P1' isProcessing={false} />);
    await user.click(screen.getByRole('button', { name: 'Edit Image' }));
    const input = screen.getByLabelText('Upload Image');
    await user.upload(input, new File(['image'], 'pending.png', {type: 'image/png'}));
    expect(screen.getByRole('img', {name: 'Pending image'})).toHaveAttribute('src', 'blob:reference-test');
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', {name: 'Remove image'}));
    expect(screen.getByRole('button', {name: 'Upload and apply'})).toBeDisabled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:reference-test');
    await user.upload(input, new File(['image'], 'pending.png', {type: 'image/png'}));
    await user.click(screen.getByRole('button', {name: 'Cancel upload'}));
    expect(screen.getByRole('img', {name: 'Original Image'})).toHaveAttribute('src', subject.previewUrl);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the prepared file after an upload request fails so retry needs no reselection', async () => {
    const user = userEvent.setup();
    renderProject(<SubjectList projectId='P1' reflixId='P1' isProcessing={false} />);
    await user.click(screen.getByRole('button', {name: 'Edit Image'}));
    await user.upload(screen.getByLabelText('Upload Image'), new File(['image'], 'retry.png', {type: 'image/png'}));
    await user.click(screen.getByRole('button', {name: 'Upload and apply'}));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => completeMutation(Response.json({message: 'Upload failed'}, {status: 500})));
    await waitFor(() => expect(screen.getByRole('button', {name: 'Upload and apply'})).toBeEnabled());
    expect(screen.getByRole('img', {name: 'Pending image'})).toHaveAttribute('src', 'blob:reference-test');
    await user.click(screen.getByRole('button', {name: 'Upload and apply'}));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(2));
    expect(submittedForm().get('subjectId')).toBe(subject.id);
    await act(async () => completeMutation(Response.json({message: 'Saved'})));
  });

  it('takes the empty import state straight to image upload creation without a write', async () => {
    const user = userEvent.setup();
    renderProject(<SubjectList projectId='P1' reflixId='P1' isProcessing={false} />);
    await user.click(screen.getByRole('button', {name: 'Import from project'}));
    expect(screen.getByText('No subjects to import')).toBeVisible();
    expect(screen.queryByRole('button', {name: /Import \d+ subjects/})).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Create from an image'}));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('tab', {name: 'Upload finished image'})).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', {name: 'Add subject'})).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('filters import candidates and clears the selection when the source project changes', async () => {
    const user = userEvent.setup();
    queryClient.setQueryData(projectDetailKeys.subjects('P1'), {...subjectsData, userProjects: [
      {id:'P1',name:'Current'}, {id:'P2',name:'Second'}, {id:'P3',name:'Third'},
    ]});
    const imported = {id:'source-hero',name:'Imported Hero',category:'Character',subjectId:'C:hero',previewUrl:null};
    renderProject(<SubjectList projectId='P1' reflixId='P1' isProcessing={false} />, {P2:[imported], P3:[{...imported,id:'third-hero',name:'Third Hero'}]});
    await user.click(screen.getByRole('button', {name:'Import from project'}));
    const dialog = within(screen.getByRole('dialog'));
    await user.click(await dialog.findByRole('button', {name:/Imported Hero/}));
    expect(dialog.getByRole('button', {name:'Import 1 subjects'})).toBeEnabled();
    expect(fetchMock).not.toHaveBeenCalled();
    await user.type(dialog.getByRole('searchbox', {name:'Search subjects'}), 'unmatched');
    expect(dialog.getByText('No matching subjects')).toBeVisible();
    await user.click(dialog.getByRole('button', {name:'Clear search'}));
    expect(dialog.getByRole('button', {name:/Imported Hero/})).toHaveAttribute('aria-pressed','true');
    await user.click(dialog.getByRole('combobox', {name:'Source project'}));
    await user.click(screen.getByRole('option', {name:'Third'}));
    await dialog.findByRole('button', {name:/Third Hero/});
    expect(dialog.getByRole('button', {name:'Import 0 subjects'})).toBeDisabled();
    await user.click(dialog.getByRole('button', {name:/Third Hero/}));
    await user.click(dialog.getByRole('button', {name:'Import 1 subjects'}));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const request = fetchMock.mock.calls.find(([, init]) => init?.method==='POST')!;
    expect(request[0]).toBe('/api/projects/subjects/import');
    expect(JSON.parse(request[1].body)).toEqual({targetReflixId:'P1',sourceSubjectIds:['third-hero']});
    await act(async () => completeMutation(Response.json({message:'Imported',importedCount:1,skippedCount:0})));
  });

  it('opens without an image and preserves prompt drafts between tabs and reopening', async () => {
    const user = userEvent.setup();
    queryClient.setQueryData(projectDetailKeys.subjects('P1'), {
      ...subjectsData,
      subjects: [{ ...subject, previewUrl: null }],
    });
    renderProject(<SubjectList projectId='P1' reflixId='P1' isProcessing={false} />);
    await user.click(screen.getByRole('button', { name: 'Edit Image' }));
    const prompt = screen.getByRole('textbox', { name: 'prompt' });
    fireEvent.change(prompt, { target: { value: 'Edited prompt' } });
    const modelSelect = screen
      .getByRole('combobox')
      .closest('form')!
      .querySelector('select[name="model"]')!;
    fireEvent.change(modelSelect, { target: { value: 'seedream' } });
    await user.click(screen.getByRole('tab', { name: 'History' }));
    expect(screen.getByText('No image history yet.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirm Replacement' })).toBeDisabled();
    await user.click(screen.getByRole('tab', { name: 'Edit Image' }));
    expect(screen.getByRole('textbox', { name: 'prompt' })).toHaveValue('Edited prompt');
    expect(screen.getByRole('combobox').closest('form')).toHaveFormValues({ model: 'seedream' });
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: 'Edit Image' }));
    expect(screen.getByRole('tab', { name: 'Edit Image' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('textbox', { name: 'prompt' })).toHaveValue('Edited prompt');
    expect(screen.getByRole('combobox').closest('form')).toHaveFormValues({ model: 'gpt-image-2' });
  });

  it('replaces only after confirmation, clears cancelled selections, and permits retry after failure', async () => {
    const user = userEvent.setup();
    const currentImage = {
      id: 1,
      url: 'https://example.com/current.png',
      urlWithName: null,
      imagePrompt: null,
      imageModel: null,
      source: 'generated',
      isCurrent: true,
      ctime: null,
    };
    queryClient.setQueryData(projectDetailKeys.subjects('P1'), {
      ...subjectsData,
      subjects: [
        {
          ...subject,
          images: [
            currentImage,
            { ...currentImage, id: 2, isCurrent: false, source: 'uploaded' },
            { ...currentImage, id: 3, isCurrent: false, source: 'regenerated' },
          ],
        },
      ],
    });
    renderProject(<SubjectList projectId='P1' reflixId='P1' isProcessing={false} />);
    await user.click(screen.getByRole('button', { name: 'Edit Image' }));
    await user.click(screen.getByRole('tab', { name: 'History' }));
    expect(screen.getByRole('button', { name: /The room Current/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Confirm Replacement' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'The room Uploaded' }));
    expect(screen.getByRole('button', { name: 'The room Uploaded' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Edit Image' }));
    await user.click(screen.getByRole('tab', { name: 'History' }));
    expect(screen.getByRole('button', { name: 'Confirm Replacement' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'The room Regenerated' }));
    await user.click(screen.getByRole('button', { name: 'The room Uploaded' }));
    expect(screen.getByRole('button', { name: 'The room Regenerated' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'The room Uploaded' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirm Replacement' }));
    expect(screen.getByRole('button', { name: 'Confirm Replacement' })).toBeDisabled();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'The room Uploaded' })).toBeDisabled(),
    );
    const request = fetchMock.mock.calls.find(
      ([url, init]) => url.startsWith('/api/projects/') && init?.method === 'POST',
    )!;
    expect(JSON.parse(request[1].body)).toEqual({
      subjectId: 'S1',
      imageId: 2,
    });
    await user.click(screen.getByRole('tab', { name: 'Edit Image' }));
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeDisabled();
    await act(async () =>
      completeMutation(Response.json({ message: 'Try again' }, { status: 500 })),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Regenerate' })).toBeEnabled());
    await user.click(screen.getByRole('tab', { name: 'History' }));
    expect(screen.getByRole('button', { name: 'The room Uploaded' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Confirm Replacement' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'The room Uploaded' })).toBeDisabled(),
    );
    await act(async () => completeMutation(Response.json({ message: 'Saved' })));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/P1/subjects');
  });
});

async function submitVoiceChange(
  user: ReturnType<typeof userEvent.setup>,
  scope: string,
  button: HTMLElement,
) {
  const requestCount = () =>
    fetchMock.mock.calls.filter(
      ([url, init]) => url.startsWith('/api/projects/') && init?.method === 'POST',
    ).length;
  const before = requestCount();
  if (scope === 'subtree') {
    await user.click(
      screen.getByRole('radio', { name: /This asset and all variants|Entire subject/ }),
    );
  }
  await user.click(button);
  if (scope === 'subject') {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    return;
  }

  const confirmation = within(screen.getByRole('alertdialog'));
  expect(
    confirmation.getByText(subjectTranslations.subtreeVoiceConfirmation.description),
  ).toBeVisible();
  expect(requestCount()).toBe(before);
  await user.click(confirmation.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(requestCount()).toBe(before);

  await user.click(button);
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(requestCount()).toBe(before);

  await user.click(button);
  await user.click(
    within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Confirm Change' }),
  );
  await waitFor(() => expect(requestCount()).toBe(before + 1));
}

describe('subject voice creation', () => {
  it('opens the same subject editor from the card microphone and image, with the requested tab and appearance context', async () => {
    const user = userEvent.setup();
    const parent = { ...subject, id: 'parent', displayName: 'A long character name', category: 'character' };
    const child = { ...parent, id: 'child', parentId: parent.id, displayName: 'Changed appearance' };
    queryClient.setQueryData(projectDetailKeys.subjects('P1'), { ...subjectsData, subjects: [parent, child] });
    renderProject(<SubjectList projectId='P1' reflixId='P1' isProcessing={false} />);
    const microphone = screen.getByRole('button', { name: 'Edit voice for A long character name' });
    expect(microphone).toHaveTextContent('');
    await user.click(microphone);
    const voiceEditor = screen.getByRole('dialog', { name: 'A long character name - Voice' });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(voiceEditor).toHaveClass('subject-image-dialog');
    expect(within(voiceEditor).getByRole('tab', { name: 'Voice' })).toHaveAttribute('aria-selected', 'true');
    expect(within(voiceEditor).getByRole('group', { name: 'Appearances' }).querySelectorAll('button')).toHaveLength(2);
    expect(within(voiceEditor).getByRole('radio', { name: /Current asset only/ })).toBeChecked();
    await user.click(within(voiceEditor).getByRole('button', { name: 'Close' }));
    expect(microphone).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Edit Image' }));
    const imageEditor = screen.getByRole('dialog', { name: 'A long character name - Edit Image' });
    expect(imageEditor).toHaveClass('subject-image-dialog');
    expect(within(imageEditor).getByRole('tab', { name: 'Edit Image' })).toHaveAttribute('aria-selected', 'true');
    await user.click(within(imageEditor).getByRole('tab', { name: 'Voice' }));
    expect(screen.getByRole('dialog', { name: 'A long character name - Voice' })).toBe(imageEditor);
    expect(screen.getAllByRole('dialog')).toEqual([imageEditor]);
    expect(within(imageEditor).getByRole('group', { name: 'Appearances' }).querySelectorAll('button')).toHaveLength(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  async function openVoiceDialog(scope: 'subject' | 'subtree', tab: string, bound = false) {
    const user = userEvent.setup();
    const parent = {
      ...subject,
      id: 'parent',
      displayName: 'Parent',
      category: 'character',
      voice: bound ? { platform: 'minimax', voiceId: 'existing-voice' } : null,
    };
    const data = {
      ...subjectsData,
      subjects: [parent, { ...parent, id: 'child', parentId: parent.id, displayName: 'Child' }],
    };
    queryClient.setQueryData(projectDetailKeys.subjects('P1'), data);
    const fetchImplementation = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      url.endsWith('/subjects')
        ? Promise.resolve(Response.json(data))
        : fetchImplementation(url, init),
    );
    renderProject(<SubjectList projectId='P1' reflixId='P1' isProcessing={false} />);
    await user.click(screen.getByRole('button', { name: 'Edit voice for Parent' }));
    expect(screen.getByRole('radio', { name: /Current asset only/ })).toBeChecked();
    await user.click(screen.getByRole('tab', { name: tab }));
    return user;
  }

  it('keeps drafts between tabs in one dialog and resets them when reopened', async () => {
    const user = await openVoiceDialog('subtree', 'Design Voice');
    const dialogElement = screen.getByRole('dialog');
    const dialog = within(dialogElement);
    await user.type(dialog.getByRole('textbox', { name: 'Voice Name' }), 'Designed narrator');
    await user.type(dialog.getByRole('textbox', { name: 'Voice description' }), 'Calm');
    await user.click(dialog.getByRole('tab', { name: 'Clone Voice' }));
    await user.type(dialog.getByRole('textbox', { name: 'Voice Name' }), 'Cloned narrator');
    await user.click(dialog.getByRole('tab', { name: 'Voice Library' }));
    await user.click(dialog.getByRole('tab', { name: 'Design Voice' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(dialog.getByRole('textbox', { name: 'Voice Name' })).toHaveValue('Designed narrator');
    expect(dialog.getByRole('textbox', { name: 'Voice description' })).toHaveValue('Calm');
    await user.click(dialog.getByRole('tab', { name: 'Clone Voice' }));
    expect(dialog.getByRole('textbox', { name: 'Voice Name' })).toHaveValue('Cloned narrator');
    await user.click(dialog.getByRole('button', { name: 'Close' }));
    const trigger = screen.getByRole('button', { name: 'Edit voice for Parent' });
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    expect(within(screen.getByRole('region', { name: 'Edit voice for Parent' })).getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      subjectTranslations.voiceMenu.library,
      subjectTranslations.voiceMenu.designVoice,
      subjectTranslations.voiceMenu.cloneVoice,
    ]);
    expect(screen.getByRole('tab', { name: 'Voice Library' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(screen.getByRole('tab', { name: 'Design Voice' }));
    expect(screen.getByRole('textbox', { name: 'Voice Name' })).toHaveValue('');
  });

  it.each(['subject', 'subtree'] as const)(
    'hides unbind and explains the empty binding in %s scope',
    async (scope) => {
      await openVoiceDialog(scope, 'Voice Library');
      const dialog = within(screen.getByRole('dialog'));
      expect(dialog.queryByRole('button', { name: 'Unbind Voice' })).not.toBeInTheDocument();
      expect(dialog.getByText(subjectTranslations.voiceBinding.unbound)).toBeVisible();
    },
  );

  it('blocks switching, closing and unbinding during generation, and permits retry after failure', async () => {
    const user = await openVoiceDialog('subtree', 'Design Voice', true);
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByRole('textbox', { name: 'Voice description' }), 'Calm');
    const generate = dialog.getByRole('button', { name: 'Generate 3 Voice Schemes' });
    await user.click(generate);
    await waitFor(() => expect(generate).toBeDisabled());
    for (const tab of dialog.getAllByRole('tab')) expect(tab).toBeDisabled();
    expect(dialog.getByRole('button', { name: 'Unbind Voice' })).toBeDisabled();
    await user.keyboard('{Escape}');
    await user.click(dialog.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('dialog')).toBeVisible();
    await act(async () =>
      completeMutation(Response.json({ message: 'Try again' }, { status: 500 })),
    );
    await waitFor(() => expect(generate).toBeEnabled());
    expect(dialog.getByRole('textbox', { name: 'Voice description' })).toHaveValue('Calm');
    expect(dialog.getByRole('button', { name: 'Unbind Voice' })).toBeEnabled();
    await user.click(dialog.getByRole('tab', { name: 'Clone Voice' }));
    expect(dialog.getByRole('tab', { name: 'Clone Voice' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('keeps the design action in the footer and separates keyboard selection from previewing a scheme', async () => {
    const play = vi.fn();
    vi.stubGlobal('Audio', class {
      addEventListener() {}
      play = play;
      pause() {}
    });
    const user = await openVoiceDialog('subject', 'Design Voice');
    const dialog = within(screen.getByRole('dialog'));
    const generate = dialog.getByRole('button', { name: 'Generate 3 Voice Schemes' });
    expect(generate.closest('.voice-editor-footer')).not.toBeNull();
    expect(dialog.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    await user.type(dialog.getByRole('textbox', { name: 'Voice Name' }), 'Narrator');
    await user.type(dialog.getByRole('textbox', { name: 'Voice description' }), 'Calm');
    await user.click(generate);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => completeMutation(Response.json({ voices: [
      { voiceId: 'first', previewUrl: 'https://example.com/first.mp3' },
      { voiceId: 'second', previewUrl: 'https://example.com/second.mp3' },
    ] })));
    const scheme = await dialog.findByRole('button', { name: 'Scheme 2' });
    const requestsBeforeSelection = fetchMock.mock.calls.length;
    scheme.focus();
    await user.keyboard('{Enter}');
    expect(scheme).toHaveAttribute('aria-pressed', 'true');
    await user.click(dialog.getByRole('button', { name: 'Preview Scheme 1' }));
    expect(play).toHaveBeenCalled();
    expect(scheme).toHaveAttribute('aria-pressed', 'true');
    expect(dialog.getByRole('button', { name: 'Scheme 1' })).toHaveAttribute('aria-pressed', 'false');
    const save = dialog.getByRole('button', { name: 'Save' });
    expect(save).toBeEnabled();
    expect(save.closest('.voice-editor-footer')).not.toBeNull();
    expect(dialog.getByRole('button', { name: 'Regenerate' }).closest('.voice-editor-footer')).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(requestsBeforeSelection);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  it('shows editable preview text without presets and submits its draft after switching sources', async () => {
    const user = await openVoiceDialog('subject', 'Design Voice');
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.queryByText(subjectTranslations.voiceDesignDialog.stylePresets)).not.toBeInTheDocument();
    expect(dialog.queryByRole('button', { name: '成熟男' })).not.toBeInTheDocument();
    const text = dialog.getByRole('textbox', { name: 'Preview text' });
    expect(text).toBeVisible();
    expect(text.closest('details')).toBeNull();
    expect(text).toHaveValue(DEFAULT_PREVIEW_TEXT);
    const draft = 'Welcome to the academy.\nLet us begin.';
    await user.clear(text);
    await user.type(text, draft);
    await user.type(dialog.getByRole('textbox', { name: 'Voice description' }), 'Calm and clear');
    await user.click(dialog.getByRole('tab', { name: 'Clone Voice' }));
    await user.click(dialog.getByRole('tab', { name: 'Design Voice' }));
    expect(dialog.getByRole('textbox', { name: 'Preview text' })).toHaveValue(draft);
    await user.click(dialog.getByRole('button', { name: 'Generate 3 Voice Schemes' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const request = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(request[1].body as string)).toMatchObject({
      prompt: 'Calm and clear', previewText: draft,
    });
  });

  it('stops previews on tab switches and closing, and unbinds only the selected subject', async () => {
    const user = userEvent.setup();
    const pause = vi.fn();
    const play = vi.fn();
    vi.stubGlobal(
      'Audio',
      class {
        addEventListener() {}
        play = play;
        pause = pause;
      },
    );
    queryClient.setQueryData(projectDetailKeys.subjects('P1'), {
      subjects: [
        { ...subject, category: 'character', voice: { platform: 'minimax', voiceId: 'voice-1' } },
      ],
      userProjects: [{ id: 'P1', name: 'Project' }],
      voices: [
        {
          id: 'V1',
          voiceId: 'voice-1',
          name: 'Narrator',
          previewUrl: 'https://example.com/voice.mp3',
        },
      ],
    });
    renderProject(<SubjectList projectId='P1' reflixId='P1' isProcessing={false} />);
    expect(screen.queryByRole('button', { name: 'Preview' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit voice for The room' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.click(dialog.getByRole('tab', { name: 'Design Voice' }));
    await user.click(dialog.getByRole('button', { name: 'Preview' }));
    await user.click(dialog.getByRole('tab', { name: 'Clone Voice' }));
    expect(pause).toHaveBeenCalled();
    pause.mockClear();
    await user.click(dialog.getByRole('button', { name: 'Preview' }));
    await user.click(dialog.getByRole('button', { name: 'Close' }));
    expect(pause).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Edit voice for The room' }));
    await user.click(screen.getByRole('button', { name: 'Unbind Voice' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Unbind Voice' })).toBeDisabled(),
    );
    expect(
      JSON.parse(
        fetchMock.mock.calls.find(
          ([url, init]) => url.startsWith('/api/projects/') && init?.method === 'POST',
        )![1].body,
      ),
    ).toEqual({
      subjectId: 'S1',
      scope: 'subject',
    });
    await act(async () =>
      completeMutation(Response.json({ message: 'Try again' }, { status: 500 })),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Unbind Voice' })).toBeEnabled());
    const fetchImplementation = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      url.endsWith('/subjects')
        ? Promise.resolve(
            Response.json({ ...subjectsData, subjects: [{ ...subject, category: 'character' }] }),
          )
        : fetchImplementation(url, init),
    );
    await user.click(screen.getByRole('button', { name: 'Unbind Voice' }));
    const openDialog = screen.getByRole('dialog');
    await act(async () => completeMutation(Response.json({ message: 'Saved' })));
    await waitFor(() =>
      expect(
        within(openDialog).queryByRole('button', { name: 'Unbind Voice' }),
      ).not.toBeInTheDocument(),
    );
    expect(openDialog).toBeVisible();
    await user.click(within(openDialog).getByRole('tab', { name: 'Design Voice' }));
    expect(within(openDialog).getByRole('textbox', { name: 'Voice Name' })).toBeVisible();
  });

  it.each(['subject', 'subtree'] as const)('saves a designed voice in %s scope', async (scope) => {
    const user = await openVoiceDialog(scope, 'Design Voice');
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByRole('textbox', { name: 'Voice Name' }), 'Narrator');
    await user.type(dialog.getByRole('textbox', { name: 'Voice description' }), 'Calm');
    await user.click(dialog.getByRole('button', { name: 'Generate 3 Voice Schemes' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () =>
      completeMutation(
        Response.json({
          voices: [{ voiceId: 'designed', previewUrl: 'https://example.com/voice.mp3' }],
        }),
      ),
    );
    await user.click(await dialog.findByText('Scheme 1'));
    await submitVoiceChange(user, scope, dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled());
    const request = fetchMock.mock.calls
      .filter(([url, init]) => url.startsWith('/api/projects/') && init?.method === 'POST')
      .at(-1)!;
    expect(JSON.parse(request[1].body)).toMatchObject({
      subjectId: 'parent',
      scope,
      voiceId: 'designed',
    });
    await act(async () => completeMutation(Response.json({ message: 'Saved' })));
    await waitFor(() => expect(dialog.getByRole('button', { name: 'Save' })).toBeEnabled());
    expect(screen.getByRole('dialog')).toHaveClass('subject-image-dialog');
  });

  it('releases an audio upload when closed before metadata validation completes', async () => {
    const revokeObjectURL = vi.fn();
    let loadedMetadata: () => void;
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override createObjectURL() {
          return 'blob:pending-voice';
        }
        static override revokeObjectURL = revokeObjectURL;
      },
    );
    vi.stubGlobal(
      'Audio',
      class {
        duration = 15;
        addEventListener(event: string, listener: () => void) {
          if (event === 'loadedmetadata') loadedMetadata = listener;
        }
      },
    );
    const user = await openVoiceDialog('subject', 'Clone Voice');
    const dialog = screen.getByRole('dialog');
    await user.upload(
      dialog.querySelector('.voice-clone-editor input[type="file"]') as HTMLInputElement,
      new File(['audio'], 'voice.mp3', { type: 'audio/mpeg' }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:pending-voice');
    await act(async () => loadedMetadata());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['subject', 'subtree'] as const)('submits cloned audio with %s scope', async (scope) => {
    const pause = vi.fn();
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override createObjectURL() {
          return 'blob:voice';
        }
        static override revokeObjectURL() {}
      },
    );
    vi.stubGlobal(
      'Audio',
      class {
        duration = 15;
        play() {}
        pause = pause;
        addEventListener(event: string, listener: () => void) {
          if (event === 'loadedmetadata') queueMicrotask(listener);
        }
      },
    );
    const user = await openVoiceDialog(scope, 'Clone Voice');
    const dialogElement = screen.getByRole('dialog');
    const dialog = within(dialogElement);
    const file = new File(['audio'], 'voice.mp3', { type: 'audio/mpeg' });
    await user.upload(dialogElement.querySelector('.voice-clone-editor input[type="file"]') as HTMLInputElement, file);
    await waitFor(() => expect(dialog.getByRole('button', { name: 'Clone and apply' })).toBeEnabled());
    await user.click(dialog.getByRole('button', { name: 'Preview Audio' }));
    await submitVoiceChange(user, scope, dialog.getByRole('button', { name: 'Clone and apply' }));
    expect(pause).toHaveBeenCalled();
    await waitFor(() => expect(dialog.getByRole('button', { name: 'Clone and apply' })).toBeDisabled());
    const form = submittedForm();
    expect(Object.fromEntries(form)).toMatchObject({
      subjectId: 'parent',
      scope,
      reflixId: 'P1',
      voiceName: 'voice',
    });
    expect(form.get('file')).toBe(file);
    await act(async () => completeMutation(Response.json({ message: 'Saved' })));
    await waitFor(() => expect(dialog.getByRole('button', { name: 'Clone and apply' })).toBeEnabled());
    expect(screen.getByRole('dialog')).toBe(dialogElement);
    expect(dialogElement).toHaveClass('subject-image-dialog');
  });
});

describe('subject voice library', () => {
  it('virtualizes a large library, searches names and descriptions, and binds only on confirmation', async () => {
    const user = userEvent.setup();
    const pause = vi.fn();
    const play = vi.fn();
    vi.stubGlobal(
      'Audio',
      class {
        addEventListener() {}
        play = play;
        pause = pause;
      },
    );
    const voices = Array.from({ length: 1000 }, (_, index) => ({
      id: `V${index}`,
      voiceId: `voice-${index}`,
      name: `Voice ${String(index).padStart(4, '0')}`,
      description: index === 999 ? 'Calm narrator' : 'Bright voice',
      previewUrl: `https://example.com/${index}.mp3`,
      source: 'design',
    }));
    const character = { ...subject, category: 'character' };
    const data = { subjects: [character], voices, userProjects: [{ id: 'P1', name: 'Project' }] };
    queryClient.setQueryData(projectDetailKeys.subjects('P1'), data);
    const fetchImplementation = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      url.endsWith('/subjects')
        ? Promise.resolve(
            Response.json({
              ...data,
              subjects: [{ ...character, voice: { platform: 'minimax', voiceId: 'voice-999' } }],
            }),
          )
        : fetchImplementation(url, init),
    );
    renderProject(<SubjectList projectId='P1' reflixId='P1' isProcessing={false} />);
    await user.click(screen.getByRole('button', { name: 'Edit voice for The room' }));
    const dialogElement = screen.getByRole('dialog');
    const dialog = within(dialogElement);
    const rows = await dialog.findAllByRole('button', { name: /^Voice \d{4}$/ });
    expect(rows.length).toBeLessThan(voices.length);
    const confirm = dialog.getByRole('button', { name: 'Apply to this appearance' });
    expect(confirm).toBeDisabled();
    await user.click(dialog.getByRole('button', { name: 'Preview Voice 0000' }));
    expect(play).toHaveBeenCalled();
    expect(confirm).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();

    const search = dialog.getByRole('searchbox', { name: 'Search voices by name or description' });
    await user.type(search, '  CALM NARRATOR  ');
    expect(pause).toHaveBeenCalled();
    const lastVoice = await dialog.findByRole('button', { name: 'Voice 0999' });
    expect(lastVoice).toHaveAccessibleDescription('Calm narrator');
    expect(dialog.getAllByRole('button', { name: /^Voice \d{4}$/ })).toHaveLength(1);
    lastVoice.focus();
    await user.keyboard('{Enter}');
    expect(lastVoice).toHaveAttribute('aria-pressed', 'true');
    expect(confirm).toBeEnabled();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.clear(search);
    await user.type(search, 'missing');
    expect(dialog.queryAllByRole('button', { name: /^Voice \d{4}$/ })).toHaveLength(0);
    expect(dialog.getByRole('status')).toBeVisible();
    expect(
      dialog.getByText(
        subjectTranslations.voicePickerDialog.selectedVoice.replace('{{name}}', voices[999].name),
      ),
    ).toBeVisible();
    await user.clear(search);
    await user.type(search, 'voice 0999');
    expect(await dialog.findByRole('button', { name: 'Voice 0999' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(confirm);
    await waitFor(() => expect(confirm).toBeDisabled());
    expect(search).toBeDisabled();
    expect(
      JSON.parse(
        fetchMock.mock.calls.find(
          ([url, init]) => url.startsWith('/api/projects/') && init?.method === 'POST',
        )![1].body,
      ),
    ).toEqual({
      voiceDbId: 'V999',
      subjectId: 'S1',
      scope: 'subject',
    });
    await act(async () => completeMutation(Response.json({ message: 'Saved' })));
    await waitFor(() => expect(confirm).toBeEnabled());
    expect(dialogElement).toBeVisible();
    expect(search).toHaveValue('voice 0999');
  });
});

describe('subject hierarchy', () => {
  it.each([
    { target: 'S1', scope: 'subtree', expand: [], buttonIndex: 0 },
    { target: 'S1', scope: 'subtree', expand: ['S1'], buttonIndex: 0 },
    { target: 'S1', scope: 'subject', expand: ['S1'], buttonIndex: 1 },
    { target: 'S4', scope: 'subtree', expand: ['S1'], buttonIndex: 0 },
    { target: 'S4', scope: 'subtree', expand: ['S1', 'S4'], buttonIndex: 0 },
    { target: 'S4', scope: 'subject', expand: ['S1', 'S4'], buttonIndex: 1 },
    { target: 'S6', scope: 'subject', expand: ['S1', 'S4'], buttonIndex: 0 },
  ])(
    'binds from $target in $scope scope after selecting $expand',
    async ({ target, scope, expand }) => {
      const user = userEvent.setup();
      const data = {
        subjects: [undefined, 'S1', 'S1', 'S1', 'S4', 'S4'].map((parentId, index) => ({
          ...subject,
          id: `S${index + 1}`,
          displayName: `S${index + 1}`,
          parentId,
          category: 'character',
        })),
        userProjects: [{ id: 'P1', name: 'Project' }],
        voices: [
          {
            id: 'V1',
            voiceId: 'new-voice',
            name: 'New voice',
            platform: 'minimax',
            description: null,
            previewText: '',
            previewUrl: '',
            voiceStyle: null,
            source: null,
            ctime: null,
          },
        ],
      };
      queryClient.setQueryData(projectDetailKeys.subjects('P1'), data);
      const fetchImplementation = fetchMock.getMockImplementation()!;
      fetchMock.mockImplementation((url: string, init?: RequestInit) =>
        url.endsWith('/subjects')
          ? Promise.resolve(
              Response.json({
                ...data,
                subjects: data.subjects.map((item) =>
                  item.id === target
                    ? { ...item, voice: { platform: 'minimax', voiceId: 'new-voice' } }
                    : item,
                ),
              }),
            )
          : fetchImplementation(url, init),
      );
      renderProject(<SubjectList projectId='P1' reflixId='P1' isProcessing={false} />);
      await user.click(screen.getByRole('button', { name: 'Edit Image' }));
      for (const name of expand) {
        await user.click(screen.getByRole('button', { name: `Switch to ${name}` }));
      }
      await user.click(screen.getByRole('button', { name: `Switch to ${target}` }));
      await user.click(screen.getByRole('tab', { name: 'Voice' }));
      const dialog = within(screen.getByRole('dialog'));
      await user.click(dialog.getByText('New voice'));
      await submitVoiceChange(
        user,
        scope,
        dialog.getByRole('button', { name: 'Apply to this appearance' }),
      );
      await waitFor(() =>
        expect(
          dialog.getByRole('button', {
            name: scope === 'subtree' ? 'Apply to 6 appearances' : 'Apply to this appearance',
          }),
        ).toBeDisabled(),
      );
      const request = fetchMock.mock.calls.find(
        ([url, init]) => url.startsWith('/api/projects/') && init?.method === 'POST',
      )!;
      expect(JSON.parse(request[1].body)).toEqual({
        subjectId: scope === 'subtree' ? 'S1' : target,
        scope,
        voiceDbId: 'V1',
      });
      await act(async () => completeMutation(Response.json({ message: 'Saved' })));
      await waitFor(() =>
        expect(dialog.getByRole('button', { name: 'Unbind Voice' })).toBeEnabled(),
      );
      expect(screen.getByRole('dialog', { name: `${target} - Voice` })).toBeVisible();
    },
  );

  it('can unbind a stack even when only a descendant has a voice', async () => {
    const user = userEvent.setup();
    const parent = { ...subject, id: 'parent', displayName: 'Parent', category: 'character' };
    const child = {
      ...parent,
      id: 'child',
      parentId: parent.id,
      voice: { platform: 'minimax', voiceId: 'child-voice' },
    };
    queryClient.setQueryData(projectDetailKeys.subjects('P1'), {
      ...subjectsData,
      subjects: [parent, child],
    });
    const fetchImplementation = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      url.endsWith('/subjects')
        ? Promise.resolve(
            Response.json({ ...subjectsData, subjects: [parent, { ...child, voice: null }] }),
          )
        : fetchImplementation(url, init),
    );
    renderProject(<SubjectList projectId='P1' reflixId='P1' isProcessing={false} />);
    await user.click(screen.getByRole('button', { name: 'Edit voice for Parent' }));
    expect(screen.getByText(subjectTranslations.voiceBinding.variantsBound)).toBeVisible();
    await user.click(
      screen.getByRole('radio', { name: /This asset and all variants|Entire subject/ }),
    );
    await submitVoiceChange(user, 'subtree', screen.getByRole('button', { name: 'Unbind Voice' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const request = fetchMock.mock.calls.find(
      ([url, init]) => url.startsWith('/api/projects/') && init?.method === 'POST',
    )!;
    expect(JSON.parse(request[1].body)).toEqual({
      subjectId: parent.id,
      scope: 'subtree',
    });
    await act(async () => completeMutation(Response.json({ message: 'Saved' })));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Unbind Voice' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('dialog', { name: 'Parent - Voice' })).toBeVisible();
  });

  it('keeps stacked card previews and switches appearance histories within one stable editor', async () => {
    const user = userEvent.setup();
    const parent = {
      ...subject,
      id: 'parent',
      name: 'Parent',
      displayName: 'Parent',
      images: [
        {
          id: 1,
          url: 'https://example.com/parent-history.png',
          urlWithName: null,
          imagePrompt: null,
          imageModel: null,
          source: 'uploaded',
          isCurrent: false,
          ctime: null,
        },
      ],
    };
    const children = [1, 2, 3].map((index) => ({
      ...subject,
      id: `child-${index}`,
      parentId: parent.id,
      name: `Variant ${index}`,
      displayName: `Variant ${index}`,
      previewUrl: index === 2 ? null : `https://example.com/variant-${index}.png`,
      previewWithNameUrl: index === 2 ? 'https://example.com/variant-2-labeled.png' : null,
      images:
        index === 1
          ? [{ ...parent.images[0], id: 2, url: 'https://example.com/child-history.png' }]
          : [],
    }));
    queryClient.setQueryData(projectDetailKeys.subjects('P1'), {
      ...subjectsData,
      subjects: [parent, ...children],
    });
    renderProject(<SubjectList projectId='P1' reflixId='P1' isProcessing={false} />);

    const previews = screen.queryAllByAltText('').map((image) => image.getAttribute('src'));
    expect(previews).toEqual([children[0].previewUrl, children[1].previewWithNameUrl]);
    expect(screen.getByRole('img', { name: parent.name })).toHaveAttribute(
      'src',
      parent.previewUrl,
    );
    expect(screen.queryByRole('button', { name: /Expand variants/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit Image' }));
    const modal = screen.getByRole('dialog');
    const variants = within(screen.getByRole('group', { name: 'Appearances' }));
    expect(variants.getAllByRole('button')).toHaveLength(4);
    expect(variants.getByRole('button', { name: 'Switch to Parent' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('tab', { name: 'History' }));
    await user.click(screen.getByRole('button', { name: 'Parent Uploaded' }));
    expect(within(modal).getByAltText('Original Image')).toHaveAttribute(
      'src',
      parent.images[0].url,
    );
    await user.click(variants.getByRole('button', { name: 'Switch to Variant 1' }));
    expect(screen.getByRole('dialog')).toBe(modal);
    expect(screen.getByRole('dialog', { name: 'Variant 1 - Edit Image' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirm Replacement' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Variant 1 Uploaded' }));
    expect(within(modal).getByAltText('Original Image')).toHaveAttribute(
      'src',
      children[0].images[0].url,
    );
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('heading', { name: parent.displayName })).toBeVisible();
    expect(screen.queryAllByAltText('').map((image) => image.getAttribute('src'))).toEqual(
      previews,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reaches nested appearances in one editor while preserving individual voices and the original card grid', async () => {
    const user = userEvent.setup();
    const parent = {
      ...subject,
      id: 'parent',
      displayName: 'Kaelin',
      previewUrl: null,
      category: 'character',
      voice: { platform: 'minimax', voiceId: 'adult' },
    };
    const child = {
      ...parent,
      id: 'child',
      parentId: parent.id,
      displayName: 'Young Kaelin',
      voice: { platform: 'minimax', voiceId: 'young' },
    };
    const grandchild = {
      ...child,
      id: 'grandchild',
      parentId: child.id,
      displayName: 'Young outfit',
      previewUrl: 'https://example.com/young-outfit.png',
    };
    const unlinked = { ...parent, id: 'unlinked', displayName: 'Kaelin（长发）' };
    const voices = ['adult', 'young'].map((voiceId) => ({
      id: voiceId,
      voiceId,
      name: `${voiceId} voice`,
      platform: 'minimax',
      description: null,
      previewText: '',
      previewUrl: '',
      voiceStyle: null,
      source: null,
      ctime: null,
    }));
    queryClient.setQueryData(projectDetailKeys.subjects('P1'), {
      subjects: [parent, child, grandchild, unlinked],
      voices,
      userProjects: [],
    });
    renderProject(<SubjectList projectId='P1' reflixId='P1' isProcessing={false} />);

    expect(screen.getByRole('heading', { name: unlinked.displayName })).toBeVisible();
    expect(screen.queryByRole('heading', { name: child.displayName })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit voice for Kaelin' }));
    expect(screen.getByRole('button', { name: 'Unbind Voice' })).toBeVisible();
    await user.keyboard('{Escape}');
    const card = screen.getByRole('heading', { name: 'Kaelin' }).closest('[data-subject-id]')!;
    await user.click(within(card as HTMLElement).getByRole('button', { name: 'Edit Image' }));
    const modal = screen.getByRole('dialog');
    const variants = within(screen.getByRole('group', { name: 'Appearances' }));
    expect(variants.getAllByRole('button')).toHaveLength(3);
    await user.click(variants.getByRole('button', { name: 'Switch to Young Kaelin' }));
    await user.click(screen.getByRole('tab', { name: 'Voice' }));
    expect(screen.getByRole('dialog', { name: 'Young Kaelin - Voice' })).toBeVisible();
    expect(
      within(modal.querySelector('.voice-current-row') as HTMLElement).getByText('young voice'),
    ).toBeVisible();
    await user.click(variants.getByRole('button', { name: 'Switch to Young outfit' }));
    expect(screen.getByRole('dialog')).toBe(modal);
    expect(within(modal).getByAltText('Original Image')).toHaveAttribute(
      'src',
      grandchild.previewUrl,
    );
    expect(
      within(modal.querySelector('.voice-current-row') as HTMLElement).getByText('young voice'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('heading', { name: parent.displayName })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Character (4)' }));
    await user.click(screen.getByRole('button', { name: 'Voice Library' }));
    expect(screen.getByRole('heading', { name: 'adult voice' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'young voice' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByRole('heading', { name: unlinked.displayName })).toBeVisible();
    expect(screen.queryByRole('heading', { name: child.displayName })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: grandchild.displayName })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Your Subject' })).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps subjects accessible when their parent is filtered out or disappears on refresh', async () => {
    const parent = { ...subject, id: 'parent', category: 'character', displayName: 'Parent' };
    const child = { ...subject, parentId: parent.id };
    queryClient.setQueryData(projectDetailKeys.subjects('P1'), {
      ...subjectsData,
      subjects: [parent, child],
    });
    renderProject(<SubjectList projectId='P1' reflixId='P1' isProcessing={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Environment (1)' }));
    expect(screen.getByRole('heading', { name: 'The room' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Parent' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.queryByRole('heading', { name: 'The room' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Image' }));

    await act(async () => {
      queryClient.setQueryData(projectDetailKeys.subjects('P1'), {
        ...subjectsData,
        subjects: [parent, child, { ...child, id: 'new', displayName: 'New room' }],
      });
    });
    const variants = within(screen.getByRole('group', { name: 'Appearances' }));
    fireEvent.click(await variants.findByRole('button', { name: 'Switch to New room' }));
    expect(screen.getByRole('dialog', { name: 'New room - Edit Image' })).toBeVisible();

    await act(async () => {
      queryClient.setQueryData(projectDetailKeys.subjects('P1'), {
        ...subjectsData,
        subjects: [child],
      });
    });
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Parent' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('heading', { name: 'The room' })).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('continuous subject review', () => {
  const parent = {
    ...subject,
    id: 'hero',
    name: 'Hero',
    displayName: 'Hero',
    category: 'character',
    voice: { platform: 'minimax', voiceId: 'base' },
  };
  const child = {
    ...parent,
    id: 'disguise',
    name: 'Disguise',
    displayName: 'Disguise',
    parentId: 'hero',
  };
  const deep = {
    ...parent,
    id: 'beast',
    name: 'Beast',
    displayName: 'Beast',
    parentId: 'disguise',
    voice: { platform: 'minimax', voiceId: 'beast' },
  };
  const reviewVoices = ['base', 'beast', 'new'].map((id) => ({
    id,
    voiceId: id,
    name: `${id} voice`,
    platform: 'minimax',
    description: null,
    previewText: '',
    previewUrl: '',
    voiceStyle: null,
    source: null,
    ctime: null,
  }));
  function setupReview(extra: Subject[] = []) {
    const data = {
      subjects: [parent, child, deep, ...extra],
      voices: reviewVoices,
      userProjects: [{ id: 'P1', name: 'Project' }],
    };
    queryClient.setQueryData(projectDetailKeys.subjects('P1'), data);
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      url.endsWith('/subjects') ? Promise.resolve(Response.json(data)) : original(url, init),
    );
    renderProject(<SubjectReview projectId='P1' reflixId='P1' isProcessing={false} />);
    return userEvent.setup();
  }
  const appearances = () => within(screen.getByLabelText('Appearances'));
  const inspector = () => within(screen.getByRole('complementary', { name: 'Inspect' }));

  it('switches directly to deep appearances without any modal and keeps inspector and preview aligned', async () => {
    const user = setupReview();
    expect(appearances().getAllByRole('button')).toHaveLength(3);
    await user.click(appearances().getByRole('button', { name: 'Beast beast voice' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('main').querySelector('h2')).toHaveTextContent('Beast');
    expect(inspector().getByRole('heading', { name: 'Beast' })).toBeVisible();
    expect(inspector().getByText('beast voice')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Enlarge image' }).querySelector('img'),
    ).toHaveAttribute('alt', 'Beast');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('searches deep appearances and opens the exact match in one action', async () => {
    const user = setupReview();
    await user.type(
      screen.getByRole('textbox', { name: 'Find a subject or appearance…' }),
      'Beast',
    );
    const list = within(screen.getByRole('complementary', { name: 'Subjects' }));
    expect(list.getByText('1 matching appearances')).toBeVisible();
    await user.click(list.getByRole('button', { name: 'Beast Hero › Disguise' }));
    expect(inspector().getByRole('heading', { name: 'Beast' })).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens voice editing inline and keeps selection separate from saving', async () => {
    const user = setupReview();
    await user.click(appearances().getByRole('button', { name: 'Beast beast voice' }));
    await user.click(inspector().getByRole('button', { name: 'Change voice' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Current asset only' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'new voice' }));
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Apply to this appearance' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const request = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(request[1].body)).toEqual({
      subjectId: 'beast',
      voiceDbId: 'new',
      scope: 'subject',
    });
    expect(appearances().getByRole('button', { name: 'Hero base voice' })).toBeDisabled();
    await act(async () => completeMutation(Response.json({ message: 'Saved' })));
    await waitFor(() =>
      expect(appearances().getByRole('button', { name: 'Hero base voice' })).toBeEnabled(),
    );
  });

  it('applies to the root subtree from a deep appearance only after reviewing targets and confirming', async () => {
    const user = setupReview();
    await user.click(appearances().getByRole('button', { name: 'Beast beast voice' }));
    await user.click(inspector().getByRole('button', { name: 'Change voice' }));
    await user.click(screen.getByRole('radio', { name: 'Entire subject · 3 appearances' }));
    expect(document.querySelector('.voice-editor-footer .review-targets')).toBeNull();
    expect(document.querySelector('.voice-scope-control p')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'new voice' }));
    await user.click(screen.getByRole('button', { name: 'Apply to 3 appearances' }));
    expect(fetchMock).not.toHaveBeenCalled();
    const targets = screen.getByRole('alertdialog').querySelector('.voice-confirm-targets')!;
    expect(targets).toHaveTextContent('Hero');
    expect(targets).toHaveTextContent('Disguise');
    expect(targets).toHaveTextContent('beast voice');
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Confirm Change' }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const request = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(request[1].body)).toEqual({
      subjectId: 'hero',
      voiceDbId: 'new',
      scope: 'subtree',
    });
    await act(async () => completeMutation(Response.json({ message: 'Saved' })));
  });

  it('disables unchanged single voice assignment but permits a deliberate group override', async () => {
    const user = setupReview();
    await user.click(inspector().getByRole('button', { name: 'Change voice' }));
    await user.click(screen.getByRole('button', { name: 'base voice' }));
    expect(screen.getByRole('button', { name: 'Apply to this appearance' })).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: 'Entire subject · 3 appearances' }));
    expect(screen.getByRole('button', { name: 'Apply to 3 appearances' })).toBeEnabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps unsaved image prompt when navigation is cancelled, then saves and restores a local draft', async () => {
    localStorage.removeItem('reela-image-drafts-P1');
    const user = setupReview();
    await user.click(inspector().getByRole('button', { name: 'Edit image' }));
    const prompt = screen.getByRole('textbox', { name: 'prompt' });
    await user.clear(prompt);
    await user.type(prompt, 'A saved draft');
    await user.click(appearances().getByRole('button', { name: 'Beast beast voice' }));
    expect(screen.getByRole('alertdialog')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(prompt).toHaveValue('A saved draft');
    await user.click(appearances().getByRole('button', { name: 'Beast beast voice' }));
    await user.click(screen.getByRole('button', { name: 'Save draft & continue' }));
    expect(inspector().getByRole('heading', { name: 'Beast' })).toBeVisible();
    expect(JSON.parse(localStorage.getItem('reela-image-drafts-P1')!)).toEqual({
      hero: 'A saved draft',
    });
    await user.click(appearances().getByRole('button', { name: 'Hero base voice' }));
    await user.click(inspector().getByRole('button', { name: 'Edit image' }));
    expect(screen.getByRole('textbox', { name: 'prompt' })).toHaveValue('A saved draft');
    expect(fetchMock).not.toHaveBeenCalled();
    localStorage.removeItem('reela-image-drafts-P1');
  });

  it('previews image history in the main stage and only writes when explicitly applied', async () => {
    const historical = {
      id: 99,
      url: 'https://example.com/history.png',
      urlWithName: null,
      imagePrompt: null,
      imageModel: null,
      source: 'uploaded',
      isCurrent: false,
      ctime: null,
    };
    const data = {
      subjects: [{ ...parent, images: [historical] }],
      voices: reviewVoices,
      userProjects: [],
    };
    queryClient.setQueryData(projectDetailKeys.subjects('P1'), data);
    renderProject(<SubjectReview projectId='P1' reflixId='P1' isProcessing={false} />);
    const user = userEvent.setup();
    await user.click(inspector().getByRole('button', { name: 'Image history 1' }));
    await user.click(screen.getByRole('button', { name: 'Hero Uploaded' }));
    expect(
      screen.getByRole('button', { name: 'Enlarge image' }).querySelector('img'),
    ).toHaveAttribute('src', historical.url);
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirm Replacement' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const request = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(request[1].body)).toEqual({ subjectId: 'hero', imageId: 99 });
    await act(async () => completeMutation(Response.json({ message: 'Saved' })));
  });
});

describe('card layout refinement', () => {
  it('adds subjects from the toolbar without consuming a grid tile', async () => {
    renderProject(<SubjectList projectId='P1' reflixId='P1' isProcessing={false} />);
    const add = screen.getByRole('button', { name: 'Add Your Subject' });
    expect(add.closest('[data-slot="card"]')).toBeNull();
    expect(document.querySelectorAll('[data-slot="card"]')).toHaveLength(1);
    await userEvent.setup().click(add);
    expect(screen.getByRole('dialog', { name: 'Add Your Subject' })).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the same foreground frame for single and stacked images while retaining the stack layers', () => {
    const parent = { ...subject, id: 'parent', displayName: 'Parent' };
    queryClient.setQueryData(projectDetailKeys.subjects('P1'), {
      ...subjectsData,
      subjects: [subject, parent, { ...subject, id: 'child', parentId: 'parent' }],
    });
    renderProject(<SubjectList projectId='P1' reflixId='P1' isProcessing={false} />);
    const single = document.querySelector('[data-subject-id="S1"] .subject-preview-frame')!;
    const stacked = document.querySelector('[data-subject-id="parent"] .subject-preview-frame')!;
    expect(single.className).toBe(stacked.className);
    expect(single.lastElementChild?.className).toBe(stacked.lastElementChild?.className);
    expect(single.querySelectorAll(':scope > div[aria-hidden="true"]')).toHaveLength(0);
    expect(stacked.querySelectorAll(':scope > div[aria-hidden="true"]')).toHaveLength(1);
  });
});

describe('reference-assisted subject editor', () => {
  it('uses an image version immediately, stays open, and rolls back on a failed switch', async () => {
    const images = [
      { id: 1, url: subject.previewUrl!, urlWithName: null, imagePrompt: null, imageModel: null,
        source: 'uploaded', isCurrent: true, ctime: null },
      { id: 2, url: 'https://example.com/second.png', urlWithName: null, imagePrompt: null, imageModel: null,
        source: 'uploaded', isCurrent: false, ctime: null },
    ];
    let data = { ...subjectsData, subjects: [{ ...subject, images }] };
    queryClient.setQueryData(projectDetailKeys.subjects('P1'), data);
    fetchMock.mockImplementation((url, init) => init?.method === 'POST'
      ? new Promise<Response>(resolve => { completeMutation = resolve; }) : Promise.resolve(Response.json(data)));
    renderProject(<SubjectLayoutStudyContext.Provider value='results'>
      <SubjectList projectId='P1' reflixId='P1' isProcessing={false} />
    </SubjectLayoutStudyContext.Provider>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Edit Image' }));
    await user.click(screen.getByRole('button', { name: '使用图片版本 2' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')![1].body))
      .toEqual({ subjectId: 'S1', imageId: 2 });
    expect(screen.queryByRole('button', { name: '应用此图' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '使用图片版本 2' })).toBeDisabled();
    await act(async () => completeMutation(Response.json({ message: 'Failed' }, { status: 500 })));
    expect(screen.getByRole('img', { name: 'Original Image' })).toHaveAttribute('src', subject.previewUrl);
    expect(screen.getByRole('dialog')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '使用图片版本 2' }));
    data = { ...subjectsData, subjects: [{ ...subject, previewUrl: images[1].url,
      images: images.map(image => ({ ...image, isCurrent: image.id === 2 })) }] };
    await act(async () => completeMutation(Response.json({ message: 'Saved' })));
    await waitFor(() => expect(screen.getByRole('img', { name: 'Original Image' })).toHaveAttribute('src', images[1].url));
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(screen.getByRole('button', { name: '使用图片版本 1，已应用' })).toHaveAttribute('aria-pressed', 'true');
    const count = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST').length;
    await user.click(screen.getByRole('button', { name: '使用图片版本 1，已应用' }));
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(count);
  });

  it('appends image versions as references, deduplicates, and submits URLs with uploads', async () => {
    const images = [1, 2].map(id => ({ id, url: `https://example.com/version${id}.png`, urlWithName: null,
      imagePrompt: null, imageModel: null, source: 'uploaded', isCurrent: id === 1, ctime: null }));
    let data = { ...subjectsData, subjects: [{ ...subject, images, previewUrl: images[0].url }] };
    queryClient.setQueryData(projectDetailKeys.subjects('P1'), data);
    fetchMock.mockImplementation((url, init) => init?.method === 'POST'
      ? new Promise<Response>(resolve => { completeMutation = resolve; }) : Promise.resolve(Response.json(data)));
    renderProject(<SubjectLayoutStudyContext.Provider value='results'>
      <SubjectList projectId='P1' reflixId='P1' isProcessing={false} />
    </SubjectLayoutStudyContext.Provider>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Edit Image' }));
    await user.click(screen.getByRole('button', { name: '用作参考' }));
    expect(screen.getByRole('button', { name: '用作参考' })).toBeDisabled();
    expect(screen.getAllByRole('img', { name: 'Reference preview' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: '使用图片版本 2' }));
    data = { ...subjectsData, subjects: [{ ...subject, previewUrl: images[1].url,
      images: images.map(image => ({ ...image, isCurrent: image.id === 2 })) }] };
    await act(async () => completeMutation(Response.json({ message: 'Saved' })));
    await waitFor(() => expect(screen.getByRole('button', { name: '用作参考' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: '用作参考' }));
    await user.upload(screen.getByLabelText('Upload reference'), new File(['ref'], 'third.png', { type: 'image/png' }));
    expect(screen.getAllByRole('img', { name: 'Reference preview' })).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'Regenerate' }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(2));
    const form = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')[1][1].body as FormData;
    expect(form.getAll('referenceImages').slice(0, 2)).toEqual(images.map(image => image.url));
    expect((form.getAll('referenceImages')[2] as File).name).toBe('third.png');
    await act(async () => completeMutation(Response.json({ taskId: 'j', subjectId: 'S1', status: 'queued', message: 'Queued' })));
  });

  it('appends multiple uploaded references, removes one, and submits every remaining reference', async () => {
    vi.mocked(URL.createObjectURL).mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second').mockReturnValueOnce('blob:third');
    const user = userEvent.setup();
    renderProject(<SubjectList projectId='P1' reflixId='P1' isProcessing={false} />);
    await user.click(screen.getByRole('button', { name: 'Edit Image' }));
    const files = ['first', 'second', 'third'].map(name => new File([name], `${name}.png`, { type: 'image/png' }));
    await user.upload(screen.getByLabelText('Upload reference'), files);
    await waitFor(() => expect(screen.getAllByRole('img', { name: 'Reference preview' })).toHaveLength(3));
    await user.click(screen.getAllByRole('button', { name: 'Remove reference' })[1]);
    expect(screen.getAllByRole('img', { name: 'Reference preview' })).toHaveLength(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:second');
    await user.click(screen.getByRole('button', { name: 'Regenerate' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(submittedForm().getAll('referenceImages').map(value => (value as File).name)).toEqual(['first.png', 'third.png']);
    expect(submittedForm().has('parentImage')).toBe(false);
    await act(async () => completeMutation(Response.json({ taskId: 'j', subjectId: 'S1', status: 'queued', message: 'Queued' })));
  });

  it('previews an uploaded reference without replacing the image, then submits it for generation', async () => {
    const user = userEvent.setup();
    renderProject(<SubjectList projectId='P1' reflixId='P1' isProcessing={false} />);
    await user.click(screen.getByRole('button', { name: 'Edit Image' }));
    const file = new File(['reference'], 'reference.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Upload reference'), file);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('img', { name: 'Original Image' })).toHaveAttribute('src', subject.previewUrl);
    expect(screen.getByRole('img', { name: 'Reference preview' })).toHaveAttribute('src', 'blob:reference-test');
    expect(document.querySelector('.subject-reference-thumb')).toHaveAttribute('title', 'reference.png');
    const referenceRegion = screen.getByRole('region', { name: 'Reference image' });
    expect(within(referenceRegion).getByRole('button', { name: 'Add image' })).toBeEnabled();
    expect(within(referenceRegion).queryByRole('button', { name: 'No reference' })).not.toBeInTheDocument();
    expect(within(referenceRegion).queryByRole('button', { name: 'Current image' })).not.toBeInTheDocument();
    expect(referenceRegion.querySelector('p')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Regenerate' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(submittedForm().get('parentImage')).toBeInstanceOf(File);
    expect((submittedForm().get('parentImage') as File).name).toBe('reference.png');
    expect(submittedForm().get('subjectDbId')).toBe('S1');
    expect(fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')?.[0]).toBe('/api/projects/subjects/regenerate');
    await act(async () => completeMutation(Response.json({ taskId: 'j', subjectId: 'S1', status: 'queued', message: 'Queued' })));
  });

  it('lets variants exclude the parent reference and restores independent reference choices after switching', async () => {
    const user = userEvent.setup();
    const child = { ...subject, id: 'child', displayName: 'Child', parentId: 'S1', previewUrl: 'https://example.com/child.png' };
    queryClient.setQueryData(projectDetailKeys.subjects('P1'), { ...subjectsData, subjects: [subject, child] });
    renderProject(<SubjectList projectId='P1' reflixId='P1' isProcessing={false} />);
    await user.click(screen.getByRole('button', { name: 'Edit Image' }));
    await user.upload(screen.getByLabelText('Upload reference'), new File(['root-ref'], 'root-ref.png', { type: 'image/png' }));
    await user.click(screen.getByRole('button', { name: 'Switch to Child' }));
    expect(screen.getByRole('img', { name: 'Reference preview' })).toHaveAttribute('src', subject.previewUrl);
    await user.click(screen.getByRole('button', { name: 'Remove reference' }));
    await user.click(screen.getByRole('button', { name: 'Switch to The room' }));
    expect(document.querySelector('.subject-reference-thumb')).toHaveAttribute('title', 'root-ref.png');
    expect(screen.getByRole('img', { name: 'Reference preview' })).toHaveAttribute('src', 'blob:reference-test');
    await user.click(screen.getByRole('button', { name: 'Switch to Child' }));
    expect(screen.queryByRole('img', { name: 'Reference preview' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Regenerate' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(submittedForm().get('parentImage')).toBe('');
    expect(submittedForm().get('subjectDbId')).toBe('child');
    await act(async () => completeMutation(Response.json({ taskId: 'j', subjectId: 'child', status: 'queued', message: 'Queued' })));
  });

  it('restricts incompatible models when using a parent reference and submits its URL', async () => {
    const user = userEvent.setup();
    const child = { ...subject, id: 'child', displayName: 'Child', parentId: 'S1' };
    queryClient.setQueryData(projectDetailKeys.subjects('P1'), { ...subjectsData, subjects: [subject, child] });
    renderProject(<SubjectList projectId='P1' reflixId='P1' isProcessing={false} />);
    await user.click(screen.getByRole('button', { name: 'Edit Image' }));
    await user.click(screen.getByRole('button', { name: 'Switch to Child' }));
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Model' }), { key: 'ArrowDown' });
    expect(screen.queryByRole('option', { name: 'Wan' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Z Image' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'GPT Image 2' }));
    await user.click(screen.getByRole('button', { name: 'Regenerate' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(submittedForm().get('parentImage')).toBe(subject.previewUrl);
    await act(async () => completeMutation(Response.json({ taskId: 'j', subjectId: 'child', status: 'queued', message: 'Queued' })));
  });

  it('serializes all reference files when adding a new subject', async () => {
    vi.mocked(URL.createObjectURL).mockReturnValueOnce('blob:create-a').mockReturnValueOnce('blob:create-b');
    const user = userEvent.setup();
    renderProject(<SubjectList projectId='P1' reflixId='P1' isProcessing={false} />);
    await user.click(screen.getByRole('button', { name: 'Add Your Subject' }));
    await user.type(screen.getByRole('textbox', { name: 'Subject name' }), 'New Hero');
    await user.type(screen.getByRole('textbox', { name: 'prompt' }), 'Use both references');
    await user.upload(screen.getByLabelText('Upload reference'), ['a', 'b'].map(name =>
      new File([name], `${name}.png`, { type: 'image/png' })));
    await user.click(screen.getByRole('button', { name: 'Add and generate' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(submittedForm().getAll('referenceImages').map(value => (value as File).name)).toEqual(['a.png', 'b.png']);
    expect(submittedForm().get('name')).toBe('New Hero');
    await act(async () => completeMutation(Response.json({ message: 'Created', subjectId: 'new' })));
  });

  it('uses the same modal frame for creation and submits a reference-assisted generation without a final image', async () => {
    const user = userEvent.setup();
    renderProject(<SubjectList projectId='P1' reflixId='P1' isProcessing={false} />);
    await user.click(screen.getByRole('button', { name: 'Add Your Subject' }));
    expect(screen.getByRole('dialog')).toHaveClass('subject-image-dialog');
    expect(document.querySelector('.subject-editor-large-image')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Subject name' }), 'New Hero');
    await user.type(screen.getByRole('textbox', { name: 'prompt' }), 'Preserve the reference identity');
    await user.upload(screen.getByLabelText('Upload reference'), new File(['ref'], 'hero-ref.png', { type: 'image/png' }));
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Add and generate' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(Object.fromEntries(submittedForm())).toMatchObject({ reflixId: 'P1', name: 'New Hero',
      category: 'character', mode: 'generate', imagePrompt: 'Preserve the reference identity',
      model: 'gpt-image-2', imageWidth: '1600', imageHeight: '900' });
    expect(submittedForm().get('parentImage')).toBeInstanceOf(File);
    expect(submittedForm().has('image')).toBe(false);
    await act(async () => completeMutation(Response.json({ message: 'Subject created', subjectId: 'new' })));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('previews a finished upload and only creates the subject after explicit save', async () => {
    const user = userEvent.setup();
    renderProject(<SubjectList projectId='P1' reflixId='P1' isProcessing={false} />);
    await user.click(screen.getByRole('button', { name: 'Add Your Subject' }));
    await user.click(screen.getByRole('tab', { name: 'Upload finished image' }));
    await user.type(screen.getByRole('textbox', { name: 'Subject name' }), 'Uploaded Hero');
    await user.upload(screen.getByLabelText('Upload Image'), new File(['final'], 'final.png', { type: 'image/png' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('img', { name: 'Image preview' })).toHaveAttribute('src', 'blob:reference-test');
    await user.click(screen.getByRole('button', { name: 'Add subject' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(submittedForm().get('name')).toBe('Uploaded Hero');
    expect(submittedForm().get('image')).toBeInstanceOf(File);
    expect(submittedForm().has('parentImage')).toBe(false);
    await act(async () => completeMutation(Response.json({ message: 'Subject created' })));
  });

  it('does not accept a non-image reference or submit an upload operation', async () => {
    renderProject(<SubjectList projectId='P1' reflixId='P1' isProcessing={false} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Edit Image' }));
    fireEvent.change(screen.getByLabelText('Upload reference'), { target: { files: [new File(['bad'], 'bad.txt', { type: 'text/plain' })] } });
    expect(screen.queryByRole('img', { name: 'Reference preview' })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add image' })).toBeEnabled();
  });
});
