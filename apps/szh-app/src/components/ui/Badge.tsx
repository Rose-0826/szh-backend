import type { ReactNode } from 'react';
import clsx from 'clsx';
import { Ban, CheckCircle2, Circle, CircleDashed, Hourglass, Loader2, PauseCircle, XCircle } from 'lucide-react';
import type { RunStatus } from '@/types/domain';
import { runStatusMeta, type Tone } from '@/lib/status';

export function Badge({ tone = 'neutral', outline, children, className }: { tone?: Tone; outline?: boolean; children: ReactNode; className?: string }) {
  return <span className={clsx('badge', outline ? 'badge-outline' : `tone-${tone}`, className)}>{children}</span>;
}

export function RunStatusIcon({ status, className }: { status: RunStatus; className?: string }) {
  const tone = runStatusMeta[status]?.tone ?? 'neutral';
  const c = clsx('status-icon', `tone-${tone}`, className);
  const style = { color: `var(--${tone})` };
  switch (status) {
    case 'running': case 'validating': return <Loader2 className={clsx(c, 'spinner')} style={style} />;
    case 'queued': case 'created': return <CircleDashed className={c} style={style} />;
    case 'succeeded': return <CheckCircle2 className={c} style={style} />;
    case 'failed': return <XCircle className={c} style={style} />;
    case 'cancelled': return <Ban className={c} style={style} />;
    case 'cancel_requested': return <Hourglass className={c} style={style} />;
    case 'waiting_for_input': return <PauseCircle className={c} style={style} />;
    default: return <Circle className={c} style={style} />;
  }
}

/** The only way a Run status is rendered as text anywhere in the app. */
export function RunStatusBadge({ status }: { status: RunStatus }) {
  const meta = runStatusMeta[status] ?? { label: status, tone: 'neutral' as Tone, active: false };
  return (
    <Badge tone={meta.tone}>
      <span className={clsx('dot', meta.active && 'dot-live')} />
      {meta.label}
    </Badge>
  );
}

/** Marks any record that does not come from the real Harness. */
export function DemoTag({ title = '演示数据，不来自 Harness' }: { title?: string }) {
  return <span className="demo-tag" title={title}>演示</span>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}
