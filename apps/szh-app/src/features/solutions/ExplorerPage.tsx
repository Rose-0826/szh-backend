import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Boxes, LayoutGrid, List, SearchX } from 'lucide-react';
import { usePageContext } from '@/app/ui-state';
import { useSolutions } from '@/lib/api/queries';
import { Button, ButtonLink, EmptyState, PageHeader, QueryView, SearchInput, Segmented, Select, Skeleton } from '@/components/ui';
import { SolutionCard, SolutionRow } from '@/components/solutions/SolutionCard';

export function ExplorerPage() {
  usePageContext([{ label: 'Solutions' }]);
  const solutions = useSolutions();
  // Filters live in the URL so back/forward and refresh keep the view.
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const domain = params.get('domain') ?? '';
  const view = (params.get('view') as 'grid' | 'list') ?? 'grid';
  const set = (key: string, value: string) => setParams((p) => { if (value) p.set(key, value); else p.delete(key); return p; }, { replace: true });

  const domains = useMemo(() => [...new Set((solutions.data ?? []).map((s) => s.domain))].sort(), [solutions.data]);
  const filtered = useMemo(() => (solutions.data ?? []).filter((s) =>
    (!domain || s.domain === domain) &&
    (!q || [s.name, s.description, s.domain, s.id, ...s.tags].join(' ').toLowerCase().includes(q.toLowerCase()))), [solutions.data, q, domain]);

  return (
    <div className="page page-wide explorer">
      <PageHeader title="Solutions" description="可发布、版本化的专业能力。每个 Solution 版本有固定的输入规范，运行结果可追溯、可复用。"
        actions={<Button disabled title="新版本由维护者通过发布命令登记，客户端暂不提供发布">发布 Solution</Button>} />

      <div className="toolbar explorer-toolbar">
        <div className="explorer-search"><SearchInput value={q} onChange={(v) => set('q', v)} placeholder="搜索名称、领域、标签或描述" /></div>
        <Select aria-label="研究领域" style={{ width: 160 }} value={domain} onChange={(e) => set('domain', e.target.value)} placeholder="全部领域"
          options={domains.map((d) => ({ value: d, label: d }))} />
        <span className="grow" />
        <span className="small faint">{solutions.data ? `${filtered.length} 个 Solution` : ''}</span>
        <Segmented label="视图" value={view} onChange={(v) => set('view', v === 'grid' ? '' : v)}
          items={[{ value: 'grid', label: <LayoutGrid size={14} />, title: '卡片' }, { value: 'list', label: <List size={14} />, title: '列表' }]} />
      </div>

      <QueryView query={solutions}
        loading={<div className="sol-grid">{Array.from({ length: 6 }, (_, i) => <div key={i} className="sol-card"><Skeleton width={36} height={36} /><Skeleton width="60%" /><Skeleton height={36} /></div>)}</div>}
        isEmpty={(d) => d.length === 0}
        empty={<div className="empty-panel"><EmptyState icon={<Boxes />} title="暂无已发布的 Solution"
          description="当前 Harness 的 Solution 注册表为空。维护者发布版本后会出现在这里；也可以在设置中切换到演示数据，体验配置与运行流程。"
          action={<ButtonLink to="/settings" size="sm">打开设置</ButtonLink>} /></div>}>
        {() => filtered.length === 0
          ? <div className="empty-panel"><EmptyState icon={<SearchX />} title="没有匹配的 Solution" description="换个关键词，或清除筛选条件。" action={<Button size="sm" onClick={() => setParams({}, { replace: true })}>清除筛选</Button>} /></div>
          : view === 'grid'
            ? <div className="sol-grid">{filtered.map((s) => <SolutionCard key={s.id} solution={s} />)}</div>
            : <div className="list list-panel">{filtered.map((s) => <SolutionRow key={s.id} solution={s} />)}</div>}
      </QueryView>
    </div>
  );
}
