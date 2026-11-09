import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { EmptyState, ButtonLink } from '@/components/ui';
import { HomePage } from '@/features/home/HomePage';
import { PlanPage } from '@/features/home/PlanPage';
import { ExplorerPage } from '@/features/solutions/ExplorerPage';
import { WorkspacePage } from '@/features/solutions/WorkspacePage';
import { RunConsolePage, RunsPage } from '@/features/runs/RunPages';
import { ArtifactsPage, ArtifactViewerPage } from '@/features/artifacts/ArtifactPages';
import { ConversationsPage } from '@/features/assistant/ConversationsPage';
import { SettingsPage } from '@/features/settings/SettingsPage';

/** `/solutions/:id/run` is kept as a deep-link alias; the Run tab lives in the Workspace URL. */
function SolutionRunRedirect() {
  const { id = '' } = useParams();
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set('tab', 'run');
  return <Navigate to={`/solutions/${id}?${params}`} replace />;
}

/** Each route change starts at the top of the content canvas (search-param changes keep position). */
function ScrollReset() {
  const { pathname } = useLocation();
  useEffect(() => {
    const el = document.getElementById('main-scroll');
    if (el) el.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

function NotFound() {
  return (
    <div className="page">
      <EmptyState title="页面不存在" description="链接可能已失效，或该页面尚未提供。" action={<ButtonLink to="/" size="sm">返回工作台</ButtonLink>} />
    </div>
  );
}

export function AppRoutes() {
  return (
    <>
      <ScrollReset />
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="plan" element={<PlanPage />} />
          <Route path="solutions" element={<ExplorerPage />} />
          <Route path="solutions/:id" element={<WorkspacePage />} />
          <Route path="solutions/:id/run" element={<SolutionRunRedirect />} />
          <Route path="runs" element={<RunsPage />} />
          <Route path="runs/:id" element={<RunConsolePage />} />
          <Route path="artifacts" element={<ArtifactsPage />} />
          <Route path="artifacts/:runId/:artifactId" element={<ArtifactViewerPage />} />
          <Route path="conversations" element={<ConversationsPage />} />
          <Route path="conversations/:id" element={<ConversationsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  );
}
