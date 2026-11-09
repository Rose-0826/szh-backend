import type { CSSProperties, ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertTriangle, Inbox, RotateCw, WifiOff } from 'lucide-react';
import { ApiError } from '@/lib/api/contract';
import { Button } from './Button';

export function Skeleton({ width = '100%', height = 14, style, className }: { width?: number | string; height?: number | string; style?: CSSProperties; className?: string }) {
  return <div className={clsx('skeleton', className)} style={{ width, height, ...style }} aria-hidden />;
}

/** Placeholder rows that match list-row geometry, so content does not jump on load. */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="list" aria-busy="true" aria-label="加载中">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="list-row">
          <Skeleton width={28} height={28} />
          <div className="grow stack" style={{ gap: 6 }}><Skeleton width={`${40 + ((i * 17) % 30)}%`} /><Skeleton width="22%" height={10} /></div>
          <Skeleton width={56} height={18} />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, description, action, compact }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={clsx('state', compact && 'state-compact')}>
      <div className="state-icon">{icon ?? <Inbox />}</div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="actions">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const offline = error instanceof ApiError && error.offline;
  const notFound = error instanceof ApiError && error.status === 404;
  return (
    <div className={clsx('state state-error', compact && 'state-compact')} role="alert">
      <div className="state-icon">{offline ? <WifiOff /> : <AlertTriangle />}</div>
      <h3>{offline ? '未连接到 Harness' : notFound ? '没有找到' : '加载失败'}</h3>
      <p>{error instanceof Error ? error.message : '发生未知错误。'}</p>
      {onRetry && !notFound && <div className="actions"><Button size="sm" icon={<RotateCw />} onClick={onRetry}>重试</Button></div>}
    </div>
  );
}

/**
 * Uniform Loading → Error → Empty → Content rendering for any query.
 * Background refetch failures keep stale data visible instead of blanking the page.
 */
export function QueryView<T>({ query, loading, empty, isEmpty, children, compact }: {
  query: UseQueryResult<T>;
  loading?: ReactNode;
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
  children: (data: T) => ReactNode;
  compact?: boolean;
}) {
  if (query.isPending) return <>{loading ?? <SkeletonRows />}</>;
  if (query.isError && query.data === undefined) return <ErrorState error={query.error} onRetry={() => query.refetch()} compact={compact} />;
  const data = query.data as T;
  if (isEmpty?.(data) && empty) return <>{empty}</>;
  return <>{children(data)}</>;
}
