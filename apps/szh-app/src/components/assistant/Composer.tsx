import { useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { ArrowUp, Square } from 'lucide-react';

/** Shared prompt input used by Home, the assistant panel and conversations. Enter sends, Shift+Enter breaks line. */
export function Composer({ placeholder, onSubmit, onStop, busy, disabled, compact, autoFocusKey, footer, submitIcon }: {
  placeholder: string; onSubmit: (text: string) => void | Promise<void>; onStop?: () => void; busy?: boolean; disabled?: boolean;
  compact?: boolean; autoFocusKey?: unknown; footer?: ReactNode; submitIcon?: ReactNode;
}) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (autoFocusKey) ref.current?.focus(); }, [autoFocusKey]);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, compact ? 160 : 240) + 'px';
  }, [text, compact]);
  const send = async () => {
    const value = text.trim();
    if (!value || busy || disabled) return;
    try { await onSubmit(value); setText(''); } catch { /* caller reports; keep the draft */ }
  };
  return (
    <div className={clsx('composer', compact && 'composer-compact')} onClick={() => ref.current?.focus()}>
      <textarea ref={ref} rows={compact ? 1 : 2} value={text} placeholder={placeholder} disabled={disabled} aria-label={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
      <div className="composer-bar">
        {footer}
        <span className="grow" />
        {busy && onStop ? (
          <button type="button" className="composer-send" aria-label="停止回复" title="停止回复" onClick={(e) => { e.stopPropagation(); onStop(); }}><Square size={12} fill="currentColor" /></button>
        ) : (
          <button type="button" className="composer-send" aria-label="发送" disabled={!text.trim() || busy || disabled} onClick={() => void send()}>
            {busy ? <span className="spinner-dot" /> : (submitIcon ?? <ArrowUp />)}
          </button>
        )}
      </div>
    </div>
  );
}
