import React from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Outlet, useParams } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { Toaster } from '@repo/ui/component/toaster';
import { FeatureFlagsProvider } from '~/modules/feature-flags/feature-flags-context';
import { createWebI18n } from '~/modules/i18n/create-i18n';
import resources from '~/locales/zh';
import ProjectPage from '~/routes/_auth._dashboard.projects.$projectId/route';
import { DesktopDashboardLayout } from '~/routes/_auth._dashboard/desktop-dashboard-layout';
import { installLocalApi } from './api';
import { WorkbenchStudies } from './workbench-studies';
import './style.css';
window.__APP_CONFIG__ = {
  PIPELINE_CONFIG: JSON.stringify({
    defaultTier: 'local',
    tiers: { local: { label: '本地预览', order: 0, outputType: 'video', capabilities: [] } },
    legacyTiers: {},
  }),
} as Window['__APP_CONFIG__'];
installLocalApi();
const i18n = await createWebI18n({ language: 'zh', resources, branded: false });
const Page = ProjectPage as React.ComponentType<{ params: { projectId: string } }>;
function ActualPage() {
  const { projectId } = useParams();
  return <WorkbenchStudies><Page params={{ projectId: projectId! }} /></WorkbenchStudies>;
}
const router = createBrowserRouter([
  {
    id: 'root',
    loader: () => ({ uiLayout: { desktop: { sideBarOpen: true } }, featureFlags: {} }),
    element: (
      <FeatureFlagsProvider flags={{} as never}>
        <Outlet />
        <Toaster />
        <div className='source-preview-label'>
          本地副本 · 配音 / 历史图片可保存 · 生成 / 上传未接入
        </div>
      </FeatureFlagsProvider>
    ),
    children: [
      {
        id: 'routes/_auth',
        loader: () => ({ userInfo: null }),
        element: <DesktopDashboardLayout userInfo={null} />,
        children: [
          { path: '/projects/:projectId', element: <ActualPage /> },
          { path: '*', element: <div className='p-8'>本地预览仅包含指定项目素材页。</div> },
        ],
      },
    ],
  },
]);
createRoot(document.getElementById('root')!).render(
  <I18nextProvider i18n={i18n}>
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>
  </I18nextProvider>,
);
