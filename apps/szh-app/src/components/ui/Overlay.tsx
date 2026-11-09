import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

/* ---------- Dialog ---------- */

export function Dialog({ open, onClose, title, description, children, footer }: {
  open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, textarea, [href]') ?? [];
    // Focus the primary (last) action so Enter confirms, Esc cancels.
    const list = focusable(); (list[list.length - 1] ?? ref.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab') {
        const items = [...focusable()]; if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); previous?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabIndex={-1}>
        <div className="dialog-head"><h2 id="dialog-title">{title}</h2>{description && <p>{description}</p>}</div>
        {children && <div className="dialog-body">{children}</div>}
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ---------- Toast ---------- */

type ToastItem = { id: number; tone: 'info' | 'success' | 'danger'; message: string; action?: { label: string; onClick: () => void } };
const ToastCtx = createContext<(t: Omit<ToastItem, 'id'>) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = Date.now() + Math.random();
    setItems((list) => [...list.slice(-2), { ...t, id }]);
    setTimeout(() => setItems((list) => list.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {createPortal(
        <div className="toasts" role="status" aria-live="polite">
          {items.map((t) => (
            <div key={t.id} className="toast">
              {t.tone === 'success' ? <CheckCircle2 color="#7FD1A8" /> : t.tone === 'danger' ? <AlertCircle color="#FF9C9C" /> : <Info color="#9EBBF5" />}
              <span>{t.message}</span>
              {t.action && <button className="toast-action" onClick={t.action.onClick}>{t.action.label}</button>}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
