import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Boxes, FileStack, Play } from 'lucide-react';
import { usePageContext } from '@/app/ui-state';
import { useRuns, useSolutions } from '@/lib/api/queries';
import { isActive } from '@/lib/status';
import { ButtonLink, EmptyState, QueryView, Section, SkeletonRows } from '@/components/ui';
import { Composer } from '@/components/assistant/Composer';
import { RunRow } from '@/components/runs/RunRow';
import { SolutionRow } from '@/components/solutions/SolutionCard';
import { ArtifactRow } from '@/components/artifacts/Artifact';

function greeting() {
  const h = new Date().getHours();
  return h < 6 ? '夜深了' : h < 12 ? '早上好' : h < 18 ? '下午好' : '晚上好';
}

export function HomePage() {
  usePageContext([{ label: '工作台' }]);
  const navigate = useNavigate();
  const location = useLocation();
  const runs = useRuns();
  const solutions = useSolutions();
  const focusKey = (location.state as { focusComposer?: number } | null)?.focusComposer ?? 1;
  const active = runs.data?.filter((r) => isActive(r.status)) ?? [];
  const recentArtifacts = (runs.data ?? []).filter((r) => r.status === 'succeeded').flatMap((r) => r.artifacts.filter((a) => a.name !== 'execution.log').map((a) => ({ a, run: r }))).slice(0, 5);

  return (
    <div className="page home">
      <section className="home-hero">
        <h1>{greeting()}，今天要研究什么？</h1>
        <p className="muted">描述你的问题，SZH 会推荐合适的方案并生成执行计划；也可以直接从方案库开始。</p>
        <Composer placeholder="例如：对一组实验数据做曲线拟合并给出残差…" autoFocusKey={focusKey}
          onSubmit={(text) => navigate(`/plan?q=${encodeURIComponent(text)}`)}
          footer={<span className="xs faint">Enter 生成计划 · Shift+Enter 换行</span>} />
        <div className="home-shortcuts">
          <ButtonLink to="/solutions" size="sm" variant="ghost" icon={<Boxes />}>浏览方案库</ButtonLink>
          <ButtonLink to="/runs" size="sm" variant="ghost" icon={<Play />}>查看运行{active.length ? `（${active.length} 进行中）` : ''}</ButtonLink>
          <ButtonLink to="/artifacts" size="sm" variant="ghost" icon={<FileStack />}>查看成果</ButtonLink>
        </div>
      </section>

      <div className="home-grid">
        <Section title="继续工作" action={<ButtonLink to="/runs" size="sm" variant="ghost">全部运行<ArrowRight /></ButtonLink>}>
          <QueryView query={runs} loading={<SkeletonRows rows={3} />} isEmpty={(d) => d.length === 0} compact
            empty={<EmptyState compact icon={<Play />} title="还没有运行" description="从方案库选择一个方案，配置输入后即可运行。" action={<ButtonLink to="/solutions" size="sm">去方案库</ButtonLink>} />}>
            {(d) => <div className="list">{d.slice(0, 5).map((r) => <RunRow key={r.id} run={r} />)}</div>}
          </QueryView>
        </Section>

        <Section title="方案" count={solutions.data?.length} action={<ButtonLink to="/solutions" size="sm" variant="ghost">方案库<ArrowRight /></ButtonLink>}>
          <QueryView query={solutions} loading={<SkeletonRows rows={3} />} isEmpty={(d) => d.length === 0} compact
            empty={<EmptyState compact icon={<Boxes />} title="暂无已发布方案" description="Harness 中还没有发布任何方案版本。维护者可以用方案导入命令发布。" />}>
            {(d) => <div className="list">{d.slice(0, 5).map((s) => <SolutionRow key={s.id} solution={s} />)}</div>}
          </QueryView>
        </Section>

        <Section title="最近成果" action={<ButtonLink to="/artifacts" size="sm" variant="ghost">全部成果<ArrowRight /></ButtonLink>} className="home-span">
          <QueryView query={runs} loading={<SkeletonRows rows={2} />} isEmpty={() => recentArtifacts.length === 0} compact
            empty={<EmptyState compact icon={<FileStack />} title="还没有成果" description="运行成功后，生成的文件会出现在这里。" />}>
            {() => <div className="list">{recentArtifacts.map(({ a }) => <ArtifactRow key={a.id} artifact={a} to={`/artifacts/${a.runId}/${a.id}`} />)}</div>}
          </QueryView>
        </Section>
      </div>
    </div>
  );
}
