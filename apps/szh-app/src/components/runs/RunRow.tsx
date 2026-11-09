import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { Run } from '@/types/domain';
import { DemoTag, RunStatusBadge, RunStatusIcon } from '@/components/ui';
import { duration, relativeTime, shortId } from '@/lib/format';

export function RunRow({ run, showSolution = true }: { run: Run; showSolution?: boolean }) {
  return (
    <Link to={`/runs/${run.id}`} className="list-row">
      <RunStatusIcon status={run.status} />
      <div className="grow stack">
        <span className="row title">
          <span className="truncate">{showSolution ? run.solutionName : `运行 #${shortId(run.id)}`}</span>
          {run.origin === 'mock' && <DemoTag />}
        </span>
        <span className="sub truncate">
          {showSolution && <>#{shortId(run.id)} · </>}v{run.version} · {relativeTime(run.createdAt)}
          {run.status === 'failed' && run.error && <span style={{ color: 'var(--danger)' }}> · {run.error}</span>}
        </span>
      </div>
      <span className="meta">{run.startedAt ? duration(run.startedAt, run.finishedAt) : ''}</span>
      <RunStatusBadge status={run.status} />
      <ChevronRight size={14} className="faint" />
    </Link>
  );
}
