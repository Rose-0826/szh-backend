import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Download, File, FileCode2, FileImage, FileJson, FileSpreadsheet, FileText, Package } from 'lucide-react';
import type { Artifact } from '@/types/domain';
import { useDataSource } from '@/lib/api/datasource';
import { fileSize } from '@/lib/format';
import { Callout, ErrorState, IconButton, Skeleton } from '@/components/ui';

export const artifactIcon = (a: Artifact) =>
  ({ image: FileImage, table: FileSpreadsheet, json: FileJson, text: FileText, pdf: FileText, model: Package, archive: Package, binary: File }[a.kind] ?? FileCode2);

export const kindLabel: Record<Artifact['kind'], string> = { image: '图像', table: '表格', pdf: 'PDF', json: 'JSON', text: '文本', model: '模型/数组', archive: '压缩包', binary: '文件' };

export function ArtifactRow({ artifact, to, selected }: { artifact: Artifact; to: string; selected?: boolean }) {
  const { source } = useDataSource();
  const Icon = artifactIcon(artifact);
  return (
    <div className="list-row artifact-row" aria-current={selected || undefined}>
      <Icon size={16} className="faint" />
      <Link to={to} className="grow truncate title artifact-link">{artifact.name}</Link>
      <span className="meta">{kindLabel[artifact.kind]}</span>
      <span className="meta" style={{ width: 64, textAlign: 'right' }}>{fileSize(artifact.size)}</span>
      <a href={source.artifactUrl(artifact)} download={artifact.name} aria-label={`下载 ${artifact.name}`} title="下载"><IconButton size="sm" label="下载" tabIndex={-1}><Download /></IconButton></a>
    </div>
  );
}

const PREVIEW_LIMIT = 2_000_000;

/** Chooses a viewer by artifact kind. Nothing is converted into charts that the data does not contain. */
export function ArtifactPreview({ artifact }: { artifact: Artifact }) {
  const { source } = useDataSource();
  const textual = ['json', 'text', 'table'].includes(artifact.kind);
  const tooLarge = artifact.size > PREVIEW_LIMIT;
  const text = useQuery({
    queryKey: ['artifact-text', artifact.runId, artifact.id],
    queryFn: () => source.readArtifactText(artifact),
    enabled: textual && !tooLarge, staleTime: Infinity,
  });

  if (artifact.kind === 'image') return <div className="preview-image"><img src={source.artifactUrl(artifact)} alt={artifact.name} /></div>;
  if (artifact.kind === 'pdf') return <iframe className="preview-frame" src={source.artifactUrl(artifact)} title={artifact.name} />;
  if (!textual) return <Callout tone="neutral" title="此类型暂不支持在线预览">{kindLabel[artifact.kind]}文件 · {fileSize(artifact.size)}。请下载后使用专业工具打开。</Callout>;
  if (tooLarge) return <Callout tone="neutral" title="文件较大，未自动加载预览">{fileSize(artifact.size)}，请下载查看。</Callout>;
  if (text.isPending) return <div className="stack" style={{ gap: 8 }}><Skeleton width="60%" /><Skeleton width="80%" /><Skeleton width="45%" /></div>;
  if (text.isError) return <ErrorState compact error={text.error} onRetry={() => text.refetch()} />;
  if (artifact.kind === 'table') return <CsvTable text={text.data} />;
  if (artifact.kind === 'json') {
    let pretty = text.data;
    try { pretty = JSON.stringify(JSON.parse(text.data), null, 2); } catch { /* show raw */ }
    return <pre className="code-block preview-code">{pretty}</pre>;
  }
  return <pre className="code-block preview-code">{text.data}</pre>;
}

function CsvTable({ text }: { text: string }) {
  const rows = text.trim().split(/\r?\n/).map((l) => l.split(','));
  const [head, ...body] = rows;
  const shown = body.slice(0, 500);
  const isNum = (c: string | undefined) => c !== undefined && c !== '' && isFinite(Number(c));
  const numericCol = head.map((_, j) => shown.length > 0 && shown.every((r) => r[j] === undefined || r[j] === '' || isNum(r[j])));
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="table-wrap" style={{ maxHeight: 420 }}>
        <table className="data">
          <thead><tr>{head.map((h, i) => <th key={i} className={numericCol[i] ? 'num' : undefined}>{h}</th>)}</tr></thead>
          <tbody>{shown.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={isNum(c) ? 'num' : undefined}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <span className="xs faint">{body.length} 行 × {head.length} 列{body.length > shown.length && `，仅显示前 ${shown.length} 行`}</span>
    </div>
  );
}
