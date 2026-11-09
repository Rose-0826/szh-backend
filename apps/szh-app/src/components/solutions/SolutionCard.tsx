import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Play } from 'lucide-react';
import type { Solution } from '@/types/domain';
import { Badge, Button, DemoTag, Glyph } from '@/components/ui';
import { relativeTime } from '@/lib/format';

/** Explorer card. Whole card opens the Workspace; the primary action jumps straight to the Run tab. */
export function SolutionCard({ solution }: { solution: Solution }) {
  const navigate = useNavigate();
  const latest = solution.versions[0];
  return (
    <article className="sol-card">
      <Link to={`/solutions/${solution.id}`} className="sol-card-link" aria-label={`查看 ${solution.name}`} />
      <div className="sol-card-head">
        <Glyph seed={solution.id} label={solution.name} />
        <div className="grow stack" style={{ gap: 2 }}>
          <div className="row"><h3 className="truncate">{solution.name}</h3>{solution.origin === 'mock' && <DemoTag />}</div>
          <span className="xs faint">{solution.domain} · v{solution.latestVersion}{solution.versions.length > 1 ? ` · ${solution.versions.length} 个版本` : ''}</span>
        </div>
      </div>
      <p className="sol-card-desc">{solution.description}</p>
      {solution.tags.length > 0 && (
        <div className="sol-card-tags">{solution.tags.slice(0, 3).map((t) => <Badge key={t} outline>{t}</Badge>)}</div>
      )}
      <div className="sol-card-foot">
        <Badge tone={latest?.status === 'published' ? 'success' : 'neutral'}><span className="dot" />{latest?.status === 'published' ? '已发布' : '草稿'}</Badge>
        <span className="xs faint">{latest?.publishedAt ? `发布于 ${relativeTime(latest.publishedAt)}` : ''}</span>
        <span className="grow" />
        <Button size="sm" className="sol-card-action" icon={<Play />} onClick={() => navigate(`/solutions/${solution.id}?tab=run`)}>运行</Button>
      </div>
    </article>
  );
}

export function SolutionRow({ solution }: { solution: Solution }) {
  return (
    <Link to={`/solutions/${solution.id}`} className="list-row">
      <Glyph seed={solution.id} label={solution.name} size="sm" />
      <div className="grow stack">
        <span className="row title"><span className="truncate">{solution.name}</span>{solution.origin === 'mock' && <DemoTag />}</span>
        <span className="sub truncate">{solution.domain} · {solution.description}</span>
      </div>
      <span className="meta">v{solution.latestVersion}</span>
      <ChevronRight size={14} className="faint" />
    </Link>
  );
}
