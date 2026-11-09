import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Check, Copy } from 'lucide-react';
import type { Run, RunEvent, RunStatus } from '@/types/domain';
import { clock, duration } from '@/lib/format';
import { runStatusMeta } from '@/lib/status';
import { IconButton, RunStatusIcon, Switch } from '@/components/ui';

/**
 * Lifecycle built strictly from the statuses/timestamps Harness reports.
 * No percentages, no invented stages.
 */
export function RunLifecycle({ run }: { run: Run }) {
  const terminal: RunStatus = ['succeeded', 'failed', 'cancelled'].includes(run.status) ? run.status : 'succeeded';
  const reached = (s: RunStatus) => run.events.some((e) => e.status === s) || run.status === s;
  const steps: { status: RunStatus; label: string; at?: string; state: 'done' | 'current' | 'todo' }[] = [
    { status: 'queued', label: '已提交', at: run.createdAt, state: run.status === 'queued' ? 'current' : 'done' },
    { status: 'running', label: '执行', at: run.startedAt, state: run.status === 'running' || run.status === 'cancel_requested' ? 'current' : reached('running') || run.finishedAt ? (run.startedAt ? 'done' : 'todo') : 'todo' },
    { status: terminal, label: run.finishedAt ? runStatusMeta[terminal].label : '完成', at: run.finishedAt, state: run.finishedAt ? 'done' : 'todo' },
  ];
  return (
    <ol className="lifecycle">
      {steps.map((s, i) => (
        <li key={i} className={clsx('lifecycle-step', `is-${s.state}`, s.state === 'done' && i === 2 && `end-${terminal}`,
          s.state === 'done' && i === 1 && terminal !== 'succeeded' && run.finishedAt && 'is-interrupted')}>
          <span className="lifecycle-node">{
            s.state === 'todo' ? <span className="node-empty" />
              : s.state === 'current' ? <RunStatusIcon status={run.status} />
                : i === 2 ? <RunStatusIcon status={terminal} />
                  // Execution that ended in failure/cancel was entered, not completed: no success tick.
                  : i === 1 && terminal !== 'succeeded' && run.finishedAt ? <span className="node-entered" />
                    : <RunStatusIcon status="succeeded" />
          }</span>
          <span className="lifecycle-label">{s.label}</span>
          <span className="lifecycle-time">{s.at ? clock(s.at) : s.state === 'current' ? '进行中' : '—'}</span>
          {i === 1 && s.at && <span className="lifecycle-dur">{duration(run.startedAt, run.finishedAt)}</span>}
        </li>
      ))}
    </ol>
  );
}

export function EventLog({ events, live, emptyText, title = '事件' }: { events: RunEvent[]; live: boolean; emptyText: string; title?: string }) {
  const [follow, setFollow] = useState(true);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (follow && ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [events.length, follow]);
  const copy = async () => {
    await navigator.clipboard.writeText(events.map((e) => `[${e.at}] ${e.message}`).join('\n'));
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="event-log">
      <div className="event-log-head">
        <span className="small" style={{ fontWeight: 500 }}>{title}</span>
        <span className="xs faint">{events.length} 条{live && ' · 实时更新'}</span>
        <span className="grow" />
        <label className="row xs muted" style={{ gap: 6 }}>自动滚动<Switch label="自动滚动" checked={follow} onChange={setFollow} /></label>
        <IconButton size="sm" label={copied ? '已复制' : '复制全部'} onClick={copy}>{copied ? <Check /> : <Copy />}</IconButton>
      </div>
      <div className="log-view" ref={ref} role="log" aria-live={live ? 'polite' : 'off'} style={{ maxHeight: 360, minHeight: 120 }}>
        {events.length === 0 ? <div className="log-line"><span className="t" /><span style={{ color: '#7E8A9C' }}>{emptyText}</span></div> :
          events.map((e, i) => (
            <div key={i} className={clsx('log-line', `is-${e.kind}`)}><span className="t">{clock(e.at)}</span><span>{e.message}</span></div>
          ))}
      </div>
    </div>
  );
}
