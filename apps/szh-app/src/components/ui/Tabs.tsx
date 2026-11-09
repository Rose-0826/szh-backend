import type { ReactNode } from 'react';

export interface TabItem<T extends string> { value: T; label: ReactNode; count?: number; icon?: ReactNode }

/** Underline tabs. Controlled; callers usually bind `value` to a URL search param so tabs survive refresh. */
export function Tabs<T extends string>({ items, value, onChange, label }: { items: TabItem<T>[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}
      onKeyDown={(e) => {
        const i = items.findIndex((t) => t.value === value);
        if (e.key === 'ArrowRight') onChange(items[(i + 1) % items.length].value);
        if (e.key === 'ArrowLeft') onChange(items[(i - 1 + items.length) % items.length].value);
      }}>
      {items.map((t) => (
        <button key={t.value} role="tab" type="button" className="tab" aria-selected={t.value === value} tabIndex={t.value === value ? 0 : -1} onClick={() => onChange(t.value)}>
          {t.icon}{t.label}{t.count !== undefined && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ items, value, onChange, label }: { items: { value: T; label: ReactNode; title?: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {items.map((t) => (
        <button key={t.value} type="button" aria-pressed={t.value === value} title={t.title} onClick={() => onChange(t.value)}>{t.label}</button>
      ))}
    </div>
  );
}
