import type { ReactNode } from 'react';
import clsx from 'clsx';
import { AlertCircle, CheckCircle2, Info, AlertTriangle } from 'lucide-react';
import type { Tone } from '@/lib/status';

export function PageHeader({ title, description, actions, leading }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; leading?: ReactNode }) {
  return (
    <header className="page-head">
      {leading}
      <div className="page-title"><h1>{title}</h1>{description && <p>{description}</p>}</div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Section({ title, count, action, children, className }: { title: ReactNode; count?: number; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('section', className)}>
      <div className="section-head">
        <h2>{title}</h2>
        {count !== undefined && <span className="section-count">{count}</span>}
        <span className="spacer" />
        {action}
      </div>
      {children}
    </section>
  );
}

export function KeyValue({ items }: { items: [ReactNode, ReactNode][] }) {
  return <dl className="kv">{items.map(([k, v], i) => <div key={i} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v ?? '—'}</dd></div>)}</dl>;
}

export function Callout({ tone = 'info', title, children, action }: { tone?: Tone; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const Icon = tone === 'danger' ? AlertCircle : tone === 'success' ? CheckCircle2 : tone === 'warning' ? AlertTriangle : Info;
  return (
    <div className={clsx('callout', `tone-${tone}`)} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon />
      <div className="grow stack" style={{ gap: 2 }}>
        {title && <div className="callout-title">{title}</div>}
        {children && <div style={{ color: 'var(--text-secondary)' }}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

/** Deterministic monogram tile for a Solution — avoids fake "scientific" cover art. */
const palettes = [
  ['#EAF1FF', '#2D61C8'], ['#E9F6EF', '#21845B'], ['#F3EEFF', '#6A4BC4'], ['#FDF0E7', '#B4581E'], ['#E8F5F7', '#1D7A8A'], ['#F1F2F5', '#3D4656'],
];
export function Glyph({ seed, label, size = 'md' }: { seed: string; label: string; size?: 'sm' | 'md' | 'lg' }) {
  const h = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const [bg, fg] = palettes[h % palettes.length];
  return <span className={clsx('glyph', size !== 'md' && `glyph-${size}`)} style={{ background: bg, color: fg }} aria-hidden>{label.slice(0, 1)}</span>;
}
