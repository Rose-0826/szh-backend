import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, Copy, Download, FileStack, MessageSquare, RotateCcw } from 'lucide-react';
import { usePageContext, useUI } from '@/app/ui-state';
import { useDataSource } from '@/lib/api/datasource';
import { useRun, useRuns } from '@/lib/api/queries';
import { dateTime, fileSize, relativeTime, shortId } from '@/lib/format';
import {
  Button, ButtonLink, DemoTag, EmptyState, IconButton, KeyValue, PageHeader, QueryView, SearchInput, Section, Skeleton, SkeletonRows,
} from '@/components/ui';
import { ArtifactPreview, ArtifactRow, artifactIcon, kindLabel } from '@/components/artifacts/Artifact';
import type { Artifact, Run } from '@/types/domain';

/** Artifacts are always shown with their source Run — there is no orphan file. */
export function ArtifactsPage() {
  usePageContext([{ label: '成果' }]);
  const runs = useRuns();
  const [q, setQ] = useState('');
  const groups = useMemo(() => (runs.data ?? [])
    .filter((r) => r.artifacts.length)
    .map((r) => ({ run: r, items: r.artifacts.filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase())) }))
    .filter((g) => g.items.length), [runs.data, q]);

  return (
    <div className="page">
      <PageHeader title="成果" description="运行生成的文件、数据与报告，按来源运行组织。" />
      <div className="toolbar"><div style={{ width: 300 }}><SearchInput value={q} onChange={setQ} placeholder="按文件名搜索" /></div></div>
      <QueryView query={runs} isEmpty={(d) => !d.some((r) => r.artifacts.length)}
        empty={<EmptyState icon={<FileStack />} title="还没有成果" description="运行成功后，生成的文件会自动出现在这里。" action={<ButtonLink to="/solutions" size="sm">去运行一个方案</ButtonLink>} />}>
        {() => groups.length === 0 ? <EmptyState compact title="没有匹配的文件" /> : (
          <div className="stack" style={{ gap: 28 }}>
            {groups.map(({ run, items }) => (
              <Section key={run.id} title={<Link to={`/runs/${run.id}`} className="row link-inline" style={{ gap: 6 }}>{run.solutionName}<span className="mono xs faint">#{shortId(run.id)}</span>{run.origin === 'mock' && <DemoTag />}</Link>}
                action={<span className="xs faint">{relativeTime(run.finishedAt ?? run.createdAt)}</span>}>
                <div className="list">{items.map((a) => <ArtifactRow key={a.id} artifact={a} to={`/artifacts/${run.id}/${a.id}`} />)}</div>
              </Section>
            ))}
          </div>
        )}
      </QueryView>
    </div>
  );
}

export function ArtifactViewerPage() {
  const { runId = '', artifactId = '' } = useParams();
  const run = useRun(runId);
  return (
    <QueryView query={run} loading={<div className="page page-wide"><Skeleton width={320} height={26} /><div style={{ height: 24 }} /><SkeletonRows rows={5} /></div>}>
      {(r) => {
        const artifact = r.artifacts.find((a) => a.id === artifactId);
        return artifact ? <Viewer run={r} artifact={artifact} /> : (
          <div className="page"><EmptyState title="未找到该成果文件" description="它可能属于另一次运行，或已被清理。" action={<ButtonLink to={`/runs/${r.id}`} size="sm">返回运行</ButtonLink>} /></div>
        );
      }}
    </QueryView>
  );
}

function Viewer({ run, artifact }: { run: Run; artifact: Artifact }) {
  usePageContext([{ label: '成果', to: '/artifacts' }, { label: `${run.solutionName} #${shortId(run.id)}`, to: `/runs/${run.id}` }, { label: artifact.name }],
    {
      kind: 'artifact', label: artifact.name, id: `${run.id}/${artifact.name}`,
      facts: [
        `类型：${kindLabel[artifact.kind]}，大小：${artifact.size} 字节${artifact.sha256 ? `，SHA-256：${artifact.sha256}` : ''}`,
        `来源运行：${run.solutionId}@${run.version}（${run.status}）`, `运行输入：${JSON.stringify(run.input)}`,
      ],
    });
  const { source } = useDataSource();
  const { setAssistantOpen } = useUI();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const Icon = artifactIcon(artifact);

  return (
    <div className="page page-wide viewer">
      <PageHeader
        leading={<span className="viewer-icon"><Icon size={20} /></span>}
        title={<span className="row" style={{ gap: 10 }}>{artifact.name}{run.origin === 'mock' && <DemoTag />}</span>}
        description={<>来自 <Link to={`/runs/${run.id}`} className="link-inline">{run.solutionName} · 运行 #{shortId(run.id)}</Link> · {kindLabel[artifact.kind]} · {fileSize(artifact.size)}</>}
        actions={<>
          <Button icon={<MessageSquare />} onClick={() => setAssistantOpen(true)}>询问 AI</Button>
          <a href={source.artifactUrl(artifact)} download={artifact.name} className="btn btn-primary"><Download />下载</a>
        </>} />

      <div className="viewer-grid">
        <nav className="viewer-files" aria-label="本次运行的文件">
          <div className="xs faint" style={{ padding: '0 12px 6px' }}>本次运行 · {run.artifacts.length} 个文件</div>
          {run.artifacts.map((a) => <ArtifactRow key={a.id} artifact={a} to={`/artifacts/${run.id}/${a.id}`} selected={a.id === artifact.id} />)}
        </nav>
        <section className="viewer-main" aria-label="预览"><ArtifactPreview key={artifact.id} artifact={artifact} /></section>
        <aside className="rail">
          <div className="rail-block">
            <h3>来源</h3>
            <KeyValue items={[
              ['方案', <Link key="s" to={`/solutions/${run.solutionId}?version=${run.version}`} className="link-inline">{run.solutionName} v{run.version}</Link>],
              ['运行', <Link key="r" to={`/runs/${run.id}`} className="link-inline mono">#{shortId(run.id)}</Link>],
              ['完成时间', dateTime(run.finishedAt)],
              ['大小', fileSize(artifact.size)],
              ...(artifact.sha256 ? [['SHA-256', <span key="h" className="row" style={{ gap: 4 }}><span className="mono xs truncate">{artifact.sha256.slice(0, 16)}…</span>
                <IconButton size="sm" label={copied ? '已复制' : '复制校验值'} onClick={async () => { await navigator.clipboard.writeText(artifact.sha256!); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check /> : <Copy />}</IconButton></span>] as [string, React.ReactNode]] : []),
            ]} />
          </div>
          <div className="rail-block">
            <h3>运行输入</h3>
            <pre className="code-block" style={{ maxHeight: 220 }}>{JSON.stringify(run.input, null, 2)}</pre>
          </div>
          <div className="rail-block">
            <h3>复用</h3>
            <Button icon={<RotateCcw />} style={{ width: '100%' }} onClick={() => navigate(`/solutions/${run.solutionId}?tab=run&version=${run.version}&from=${run.id}`)}>以相同输入再运行</Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
