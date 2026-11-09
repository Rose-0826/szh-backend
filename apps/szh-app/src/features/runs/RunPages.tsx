import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Ban, FileStack, Play, RotateCcw } from 'lucide-react';
import { usePageContext } from '@/app/ui-state';
import { useCancelRun, useRun, useRuns } from '@/lib/api/queries';
import { backendName, useDataSource } from '@/lib/api/datasource';
import { canCancel, isActive, runStatusMeta } from '@/lib/status';
import { dateTime, duration, shortId } from '@/lib/format';
import {
  Button, ButtonLink, Callout, DemoTag, Dialog, EmptyState, KeyValue, PageHeader, QueryView, RunStatusBadge, Section, Segmented, Skeleton, SkeletonRows, useToast,
} from '@/components/ui';
import { RunRow } from '@/components/runs/RunRow';
import { EventLog, RunLifecycle } from '@/components/runs/RunTimeline';
import { ArtifactRow } from '@/components/artifacts/Artifact';
import type { Run } from '@/types/domain';

type Filter = 'all' | 'active' | 'succeeded' | 'failed';

export function RunsPage() {
  usePageContext([{ label: '运行' }]);
  const runs = useRuns();
  const { kind } = useDataSource();
  const [params, setParams] = useSearchParams();
  const filter = (params.get('status') as Filter) || 'all';
  const match = (r: Run) => filter === 'all' || (filter === 'active' ? isActive(r.status) : filter === 'failed' ? ['failed', 'cancelled'].includes(r.status) : r.status === 'succeeded');
  const count = (f: Filter) => runs.data?.filter((r) => f === 'all' || (f === 'active' ? isActive(r.status) : f === 'failed' ? ['failed', 'cancelled'].includes(r.status) : r.status === 'succeeded')).length;

  return (
    <div className="page">
      <PageHeader title="运行" description={`每次运行都固定方案版本与输入，状态由${backendName(kind)}报告。`} actions={<ButtonLink to="/solutions" variant="primary" icon={<Play />}>新建运行</ButtonLink>} />
      <div className="toolbar">
        <Segmented<Filter> label="状态" value={filter} onChange={(v) => setParams(v === 'all' ? {} : { status: v }, { replace: true })}
          items={(['all', 'active', 'succeeded', 'failed'] as Filter[]).map((f) => ({ value: f, label: <>{{ all: '全部', active: '进行中', succeeded: '已完成', failed: '失败/取消' }[f]}{runs.data && <span className="faint"> {count(f)}</span>}</> }))} />
      </div>
      <QueryView query={runs} isEmpty={(d) => d.length === 0}
        empty={<EmptyState icon={<Play />} title="还没有运行记录" description="在 Solutions 中选择一个 Solution，配置输入后即可运行。" action={<ButtonLink to="/solutions" size="sm">浏览 Solutions</ButtonLink>} />}>
        {(d) => { const shown = d.filter(match); return shown.length ? <div className="list">{shown.map((r) => <RunRow key={r.id} run={r} />)}</div> : <EmptyState compact title="没有符合条件的运行" />; }}
      </QueryView>
    </div>
  );
}

export function RunConsolePage() {
  const { id = '' } = useParams();
  const run = useRun(id);
  return <QueryView query={run} loading={<ConsoleSkeleton />}>{(r) => <RunConsole run={r} />}</QueryView>;
}

function RunConsole({ run }: { run: Run }) {
  usePageContext([{ label: '运行', to: '/runs' }, { label: `${run.solutionName} #${shortId(run.id)}` }], {
    kind: 'run', label: `${run.solutionName} #${shortId(run.id)}`, id: run.id,
    facts: [
      `方案：${run.solutionId}@${run.version}`, `状态：${runStatusMeta[run.status]?.label ?? run.status}（${run.status}）`,
      `创建：${run.createdAt}`, ...(run.finishedAt ? [`结束：${run.finishedAt}`] : []), ...(run.error ? [`错误：${run.error}`] : []),
      `输入：${JSON.stringify(run.input)}`, `成果文件：${run.artifacts.map((a) => a.name).join('、') || '无'}`,
    ],
  });
  const cancel = useCancelRun(run.id);
  const toast = useToast();
  const navigate = useNavigate();
  const { kind } = useDataSource();
  const backend = backendName(kind);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const live = isActive(run.status);
  // Harness does not persist cancel_requested yet: keep showing it locally until a terminal status arrives.
  const status = cancel.isSuccess && (run.status === 'queued' || run.status === 'running') ? 'cancel_requested' : run.status;
  const log = run.artifacts.find((a) => a.name === 'execution.log');
  const results = run.artifacts.filter((a) => a !== log);

  const doCancel = async () => {
    try { await cancel.mutateAsync(); toast({ tone: 'info', message: `已请求取消，等待${backend}确认。` }); }
    catch (e) { toast({ tone: 'danger', message: (e as Error).message }); }
    setConfirmCancel(false);
  };

  return (
    <div className="page page-wide console">
      <header className="console-head">
        <div className="grow stack" style={{ gap: 6, minWidth: 0 }}>
          <div className="row" style={{ gap: 10 }}>
            <h1 className="truncate">{run.solutionName}</h1><RunStatusBadge status={status} />{run.origin === 'mock' && <DemoTag />}
          </div>
          <div className="row small muted" style={{ gap: 6, flexWrap: 'wrap' }}>
            <span className="mono">#{shortId(run.id)}</span>·
            <Link to={`/solutions/${run.solutionId}?version=${run.version}`} className="link-inline">v{run.version}</Link>·
            <span>创建于 {dateTime(run.createdAt)}</span>
            {run.startedAt && <>·<span>耗时 {duration(run.startedAt, run.finishedAt)}</span></>}
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {canCancel(status) && <Button variant="danger" icon={<Ban />} onClick={() => setConfirmCancel(true)}>取消运行</Button>}
          {!live && <Button icon={<RotateCcw />} onClick={() => navigate(`/solutions/${run.solutionId}?tab=run&version=${run.version}&from=${run.id}`)}>以此为基础再运行</Button>}
          {run.status === 'succeeded' && results[0] && <ButtonLink variant="primary" to={`/artifacts/${run.id}/${results[0].id}`} icon={<FileStack />}>查看成果</ButtonLink>}
        </div>
      </header>

      <RunLifecycle run={run} />

      {run.status === 'failed' && (
        <Callout tone="danger" title="运行失败" action={<Button size="sm" icon={<RotateCcw />} onClick={() => navigate(`/solutions/${run.solutionId}?tab=run&version=${run.version}&from=${run.id}`)}>修改输入重试</Button>}>
          {run.error ?? `${backend}未返回错误详情。`}{log && <> 可在下方执行日志中查看详细输出。</>}
        </Callout>
      )}
      {status === 'queued' && <Callout tone="neutral">已进入执行队列。{backend}按顺序执行运行，开始后这里会自动更新。</Callout>}
      {status === 'cancel_requested' && <Callout tone="warning" title="已请求取消，等待执行停止">取消请求已被受理。最终结果以{backend}报告的状态为准：如果运行在停止前已经完成，会显示为已完成。</Callout>}

      <div className="two-col">
        <div className="stack" style={{ gap: 28 }}>
          <EventLog title={run.origin === 'harness' ? '状态记录' : '事件'} events={run.events} live={live} emptyText="暂无记录" />
          {run.origin === 'harness' && <p className="xs faint" style={{ marginTop: -16 }}>依据 Harness 记录的状态时间整理。当前 Harness 不提供逐步进度或实时日志；详细输出在运行成功后作为执行日志提供。</p>}
          {log && <Section title="执行日志"><ArtifactRow artifact={log} to={`/artifacts/${run.id}/${log.id}`} /></Section>}
          <Section title="成果" count={results.length}>
            {results.length ? <div className="list">{results.map((a) => <ArtifactRow key={a.id} artifact={a} to={`/artifacts/${run.id}/${a.id}`} />)}</div>
              : <EmptyState compact icon={<FileStack />} title={live ? '运行结束后生成成果' : '没有生成成果文件'} />}
          </Section>
        </div>
        <aside className="rail">
          <div className="rail-block">
            <h3>运行信息</h3>
            <KeyValue items={[
              ['运行 ID', <span key="i" className="mono xs">{run.id}</span>],
              ['方案', <Link key="s" to={`/solutions/${run.solutionId}`} className="link-inline">{run.solutionName}</Link>],
              ['版本', `v${run.version}`],
              ['开始', dateTime(run.startedAt)], ['结束', dateTime(run.finishedAt)],
              ...(run.sourceRunId ? [['来源运行', <Link key="src" to={`/runs/${run.sourceRunId}`} className="link-inline">#{shortId(run.sourceRunId)}</Link>] as [string, React.ReactNode]] : []),
            ]} />
          </div>
          <div className="rail-block">
            <h3>输入配置</h3>
            <pre className="code-block" style={{ maxHeight: 280 }}>{JSON.stringify(run.input, null, 2)}</pre>
          </div>
          {results.length > 0 && <Link to={`/artifacts/${run.id}/${results[0].id}`} className="link-btn">打开成果查看器<ArrowRight /></Link>}
        </aside>
      </div>

      <Dialog open={confirmCancel} onClose={() => setConfirmCancel(false)} title="取消这次运行？"
        description="已执行的部分不会保留成果。取消后可以基于相同输入重新运行。"
        footer={<><Button onClick={() => setConfirmCancel(false)}>继续运行</Button><Button variant="danger" loading={cancel.isPending} onClick={doCancel}>取消运行</Button></>} />
    </div>
  );
}

function ConsoleSkeleton() {
  return <div className="page page-wide"><Skeleton width={280} height={26} /><Skeleton width={360} style={{ margin: '12px 0 28px' }} /><Skeleton height={64} style={{ marginBottom: 24 }} /><SkeletonRows rows={4} /></div>;
}
