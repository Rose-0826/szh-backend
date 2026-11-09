import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Boxes, LayoutGrid, List, SearchX } from 'lucide-react';
import { usePageContext } from '@/app/ui-state';
import { useSolutions } from '@/lib/api/queries';
import { Button, EmptyState, PageHeader, QueryView, SearchInput, Segmented, Select, Skeleton } from '@/components/ui';
import { SolutionCard, SolutionRow } from '@/components/solutions/SolutionCard';

export function ExplorerPage() {
  usePageContext([{ label: '方案库' }]);
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
    <div className="page page-wide">
      <PageHeader title="方案库" description="已发布的专业方案。每个方案都有固定版本、明确的输入规范与可追溯的运行记录。"
        actions={<Button disabled title="新版本由维护者通过方案导入命令发布">发布新方案</Button>} />

      <div className="toolbar">
        <div style={{ width: 300 }}><SearchInput value={q} onChange={(v) => set('q', v)} placeholder="搜索名称、领域或描述" /></div>
        <Select aria-label="研究领域" style={{ width: 160 }} value={domain} onChange={(e) => set('domain', e.target.value)} placeholder="全部领域"
          options={domains.map((d) => ({ value: d, label: d }))} />
        <span className="grow" />
        <span className="small faint">{solutions.data ? `${filtered.length} 个方案` : ''}</span>
        <Segmented label="视图" value={view} onChange={(v) => set('view', v === 'grid' ? '' : v)}
          items={[{ value: 'grid', label: <LayoutGrid size={14} />, title: '卡片' }, { value: 'list', label: <List size={14} />, title: '列表' }]} />
      </div>

      <QueryView query={solutions}
        loading={<div className="sol-grid">{Array.from({ length: 6 }, (_, i) => <div key={i} className="sol-card"><Skeleton width={36} height={36} /><Skeleton width="60%" /><Skeleton height={36} /></div>)}</div>}
        isEmpty={(d) => d.length === 0}
        empty={<EmptyState icon={<Boxes />} title="暂无已发布方案" description="Harness 方案注册表为空。维护者可使用 node scripts/import-solution.mjs 发布方案版本；也可以在设置中切换到演示数据体验完整流程。" />}>
        {() => filtered.length === 0
          ? <EmptyState icon={<SearchX />} title="没有匹配的方案" description="换个关键词，或清除筛选条件。" action={<Button size="sm" onClick={() => setParams({}, { replace: true })}>清除筛选</Button>} />
          : view === 'grid'
            ? <div className="sol-grid">{filtered.map((s) => <SolutionCard key={s.id} solution={s} />)}</div>
            : <div className="list">{filtered.map((s) => <SolutionRow key={s.id} solution={s} />)}</div>}
      </QueryView>
    </div>
  );
}
