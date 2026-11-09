import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Check, Copy, FileCode2, GitBranch, Play } from 'lucide-react';
import type { Solution, SolutionVersion } from '@/types/domain';
import { usePageContext } from '@/app/ui-state';
import { useRun, useRuns, useSolution } from '@/lib/api/queries';
import { backendName, useDataSource } from '@/lib/api/datasource';
import { fieldsFromSchema } from '@/lib/schema';
import { dateTime, relativeTime } from '@/lib/format';
import {
  Badge, Button, Callout, DemoTag, EmptyState, Glyph, IconButton, KeyValue, QueryView, Section, Segmented, Select, Skeleton, SkeletonRows, Tabs,
} from '@/components/ui';
import { RunRow } from '@/components/runs/RunRow';
import { RunConfigurator } from './RunConfigurator';

type Tab = 'overview' | 'run' | 'runs' | 'dev';

export function WorkspacePage() {
  const { id = '' } = useParams();
  const solution = useSolution(id);
  return (
    <QueryView query={solution} loading={<WorkspaceSkeleton />}>
      {(s) => <Workspace solution={s} />}
    </QueryView>
  );
}

function Workspace({ solution }: { solution: Solution }) {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'overview';
  const versionParam = params.get('version');
  const version = solution.versions.find((v) => v.version === versionParam) ?? solution.versions[0];
  const runs = useRuns();
  const ownRuns = useMemo(() => (runs.data ?? []).filter((r) => r.solutionId === solution.id), [runs.data, solution.id]);
  usePageContext([{ label: 'Solutions', to: '/solutions' }, { label: solution.name }], {
    kind: 'solution', label: solution.name, id: `${solution.id}@${version.version}`,
    facts: [
      `描述：${solution.description}`, `领域：${solution.domain}`, `执行适配器：${version.runtime.adapter}`,
      `能力边界：${version.validationScope ?? '未声明'}`, `输入规范：${JSON.stringify(version.inputSchema)}`,
    ],
  });
  const set = (patch: Record<string, string | null>) => setParams((p) => { for (const [k, v] of Object.entries(patch)) if (v) p.set(k, v); else p.delete(k); return p; });

  return (
    <div className="page page-wide workspace">
      <header className="ws-head">
        <Glyph seed={solution.id} label={solution.name} size="lg" />
        <div className="grow stack" style={{ gap: 4, minWidth: 0 }}>
          <div className="row" style={{ gap: 10 }}><h1 className="truncate">{solution.name}</h1>{solution.origin === 'mock' && <DemoTag />}</div>
          <p className="muted">{solution.description}</p>
          <div className="row" style={{ gap: 6, marginTop: 4 }}>
            <Badge outline>{solution.domain}</Badge>
            {solution.tags.map((t) => <Badge key={t} outline>{t}</Badge>)}
          </div>
        </div>
        <div className="row" style={{ gap: 8, alignSelf: 'flex-start' }}>
          <Select aria-label="版本" value={version.version} style={{ width: 128 }}
            onChange={(e) => set({ version: e.target.value === solution.latestVersion ? null : e.target.value })}
            options={solution.versions.map((v) => ({ value: v.version, label: `v${v.version}${v.version === solution.latestVersion ? '（最新）' : ''}` }))} />
          {tab !== 'run' && <Button variant="primary" icon={<Play />} onClick={() => set({ tab: 'run' })}>运行</Button>}
        </div>
      </header>

      <Tabs<Tab> label="方案视图" value={tab} onChange={(t) => set({ tab: t === 'overview' ? null : t, from: null })}
        items={[{ value: 'overview', label: '概览' }, { value: 'run', label: '运行' }, { value: 'runs', label: '记录', count: runs.data ? ownRuns.length : undefined }, { value: 'dev', label: '开发' }]} />

      <div className="ws-body" key={tab}>
        {tab === 'overview' && <Overview solution={solution} version={version} onRun={() => set({ tab: 'run' })} />}
        {tab === 'run' && <RunTab solution={solution} version={version} fromRunId={params.get('from') ?? undefined} />}
        {tab === 'runs' && <RunsTab query={runs} runs={ownRuns} onRun={() => set({ tab: 'run' })} />}
        {tab === 'dev' && <DevTab solution={solution} version={version} />}
      </div>
    </div>
  );
}

function Overview({ solution, version, onRun }: { solution: Solution; version: SolutionVersion; onRun: () => void }) {
  const fields = fieldsFromSchema(version.inputSchema);
  const outputs = Object.keys(version.delivery).filter((k) => version.delivery[k]);
  return (
    <div className="two-col">
      <div className="stack" style={{ gap: 32 }}>
        <Section title="能力边界">
          {version.validationScope ? <p>{version.validationScope}</p> : <p className="muted">该版本未声明验证范围。使用前请阅读方案文档并核对适用条件。</p>}
        </Section>
        <Section title="输入" count={fields.length}>
          {fields.length === 0 ? <p className="muted">无需输入参数。</p> : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>参数</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
                <tbody>{fields.map((f) => (
                  <tr key={f.key}>
                    <td><div style={{ fontWeight: 500 }}>{f.label}</div><code className="xs faint">{f.key}</code></td>
                    <td>{f.options ? `枚举（${f.options.length}）` : String(f.schema.type ?? '—')}</td>
                    <td>{f.required ? '是' : f.advanced ? '高级' : '否'}</td>
                    <td style={{ whiteSpace: 'normal', color: 'var(--text-secondary)' }}>{f.description ?? '—'}</td>
                  </tr>))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
        <Section title="输出">
          {outputs.length ? <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{outputs.map((o) => <Badge key={o} outline>{o}</Badge>)}</div> : <p className="muted">运行生成的文件会作为成果列出，具体以实际运行为准。</p>}
        </Section>
      </div>
      <aside className="rail">
        <div className="rail-block">
          <h3>当前版本</h3>
          <KeyValue items={[['版本', `v${version.version}`], ['状态', version.status === 'published' ? '已发布' : '草稿'], ['发布时间', dateTime(version.publishedAt)], ['执行适配器', <code key="a">{version.runtime.adapter}</code>]]} />
          <Button variant="primary" icon={<Play />} onClick={onRun} style={{ width: '100%', marginTop: 16 }}>配置并运行</Button>
        </div>
        <div className="rail-block">
          <h3>版本历史</h3>
          <div className="stack" style={{ gap: 8 }}>
            {solution.versions.map((v) => (
              <div key={v.version} className="row small"><GitBranch size={13} className="faint" /><span>v{v.version}</span><span className="grow" /><span className="xs faint">{relativeTime(v.publishedAt)}</span></div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

function RunTab({ solution, version, fromRunId }: { solution: Solution; version: SolutionVersion; fromRunId?: string }) {
  const source = useRun(fromRunId ?? '');
  const { kind } = useDataSource();
  if (fromRunId && source.isPending) return <SkeletonRows rows={3} />;
  const initial = fromRunId && source.data?.solutionId === solution.id ? source.data.input : undefined;
  return (
    <div className="two-col">
      <div className="stack" style={{ gap: 16 }}>
        {initial && <Callout tone="info" title={`已载入运行 #${fromRunId!.slice(0, 8)} 的输入`}>修改后运行将记录来源运行，便于追溯。</Callout>}
        <RunConfigurator key={version.version + (fromRunId ?? '')} solution={solution} version={version} initialInput={initial} sourceRunId={initial ? fromRunId : undefined} />
      </div>
      <aside className="rail">
        <div className="rail-block">
          <h3>运行说明</h3>
          <ol className="steps-list">
            <li>填写输入参数，高级参数默认折叠。</li>
            <li>点击“校验”，由{backendName(kind)}按版本规范检查输入。</li>
            <li>确认后创建运行，自动进入运行页跟踪状态。</li>
            <li>运行成功后，成果文件可在线预览和下载。</li>
          </ol>
        </div>
        {version.validationScope && <div className="rail-block"><h3>能力边界</h3><p className="small muted">{version.validationScope}</p></div>}
      </aside>
    </div>
  );
}

function RunsTab({ query, runs, onRun }: { query: ReturnType<typeof useRuns>; runs: ReturnType<typeof useRuns>['data'] & {}; onRun: () => void }) {
  const [filter, setFilter] = useState<'all' | 'active' | 'succeeded' | 'failed'>('all');
  const shown = runs.filter((r) => filter === 'all' || (filter === 'active' ? ['queued', 'running', 'cancel_requested'].includes(r.status) : filter === 'failed' ? ['failed', 'cancelled'].includes(r.status) : r.status === filter));
  return (
    <QueryView query={query} isEmpty={() => runs.length === 0}
      empty={<EmptyState icon={<Play />} title="这个方案还没有运行" description="配置输入后即可创建第一次运行。" action={<Button variant="primary" size="sm" icon={<Play />} onClick={onRun}>配置运行</Button>} />}>
      {() => (
        <div className="stack" style={{ gap: 12 }}>
          <Segmented label="状态筛选" value={filter} onChange={setFilter} items={[{ value: 'all', label: '全部' }, { value: 'active', label: '进行中' }, { value: 'succeeded', label: '已完成' }, { value: 'failed', label: '失败/取消' }]} />
          {shown.length ? <div className="list">{shown.map((r) => <RunRow key={r.id} run={r} showSolution={false} />)}</div> : <EmptyState compact title="没有符合条件的运行" />}
        </div>
      )}
    </QueryView>
  );
}

function DevTab({ solution, version }: { solution: Solution; version: SolutionVersion }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (key: string, text: string) => { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1500); };
  const schema = JSON.stringify(version.inputSchema, null, 2);
  return (
    <div className="two-col">
      <div className="stack" style={{ gap: 32 }}>
        <Section title="技术规格">
          <KeyValue items={[
            ['方案 ID', <code key="i">{solution.id}</code>], ['版本', `v${version.version}`],
            ['执行适配器', <code key="a">{version.runtime.adapter}</code>], ['入口', <code key="e">{version.runtime.entrypoint}</code>],
          ]} />
        </Section>
        <Section title="输入规范（JSON Schema）" action={<IconButton size="sm" label={copied === 'schema' ? '已复制' : '复制'} onClick={() => copy('schema', schema)}>{copied === 'schema' ? <Check /> : <Copy />}</IconButton>}>
          <pre className="code-block" style={{ maxHeight: 360 }}>{schema}</pre>
        </Section>
        <Section title="资源" count={version.assets.length}>
          {version.assets.length === 0 ? <p className="muted">该版本未登记代码、模型或文档资源。</p> : (
            <div className="list">{version.assets.map((a, i) => (
              <div key={i} className="list-row"><FileCode2 size={16} className="faint" />
                <div className="grow stack"><span className="title">{a.name ?? a.kind ?? '资源'}</span>{a.description && <span className="sub">{a.description}</span>}</div>
                {a.url ? <a className="link-btn" href={a.url} target="_blank" rel="noreferrer">打开</a> : <span className="meta">未提供下载</span>}
              </div>))}
            </div>
          )}
        </Section>
      </div>
      <aside className="rail">
        <div className="rail-block">
          <h3>形成新版本</h3>
          <p className="small muted">新版本需由维护者修改方案清单（manifest）后发布，已发布版本不可覆盖，以保证运行可追溯。</p>
          <div className="row" style={{ marginTop: 10 }}>
            <code className="xs grow truncate" style={{ padding: '6px 8px', background: 'var(--bg-subtle)', borderRadius: 6 }}>node scripts/import-solution.mjs &lt;manifest&gt;</code>
            <IconButton size="sm" label={copied === 'cli' ? '已复制' : '复制命令'} onClick={() => copy('cli', 'node scripts/import-solution.mjs <manifest.json>')}>{copied === 'cli' ? <Check /> : <Copy />}</IconButton>
          </div>
          <Button disabled style={{ width: '100%', marginTop: 12 }} title="界面内发布将在后续阶段提供">在界面中发布（即将提供）</Button>
        </div>
      </aside>
    </div>
  );
}

function WorkspaceSkeleton() {
  return (
    <div className="page page-wide">
      <div className="row" style={{ gap: 16, marginBottom: 24 }}><Skeleton width={48} height={48} /><div className="grow stack" style={{ gap: 8 }}><Skeleton width={240} height={22} /><Skeleton width="50%" /></div></div>
      <Skeleton height={38} style={{ marginBottom: 24 }} />
      <SkeletonRows rows={4} />
    </div>
  );
}
