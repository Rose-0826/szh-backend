import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Crumb = { label: string; to?: string };
/** `facts` are verbatim record fields sent with questions, so answers rest on real data rather than the label alone. */
export type AssistantContext = { kind: 'solution' | 'run' | 'artifact' | 'general'; label: string; id?: string; facts?: string[] };

type UIState = {
  collapsed: boolean; toggleSidebar: () => void;
  assistantOpen: boolean; setAssistantOpen: (v: boolean) => void;
  paletteOpen: boolean; setPaletteOpen: (v: boolean) => void;
  crumbs: Crumb[]; setCrumbs: (c: Crumb[]) => void;
  context: AssistantContext; setContext: (c: AssistantContext) => void;
  /** Assistant conversation per page context (kept locally until Harness supports context lookup). */
  threads: Record<string, string>; setThread: (key: string, conversationId: string | null) => void;
};

const THREADS_KEY = 'szh.assistantThreads';
const readThreads = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(THREADS_KEY) ?? '{}'); } catch { return {}; } };

const Ctx = createContext<UIState | null>(null);

/** Cross-cutting client UI state only. Server data lives in TanStack Query. */
export function UIProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('szh.sidebar') === 'collapsed');
  const [assistantOpen, setAssistantOpenState] = useState(() => localStorage.getItem('szh.assistant') === 'open');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [context, setContext] = useState<AssistantContext>({ kind: 'general', label: '工作台' });
  const [threads, setThreads] = useState<Record<string, string>>(readThreads);

  const value = useMemo<UIState>(() => ({
    threads,
    setThread: (key, id) => setThreads((t) => {
      const next = { ...t }; if (id) next[key] = id; else delete next[key];
      localStorage.setItem(THREADS_KEY, JSON.stringify(next));
      return next;
    }),
    collapsed,
    toggleSidebar: () => setCollapsed((c) => { localStorage.setItem('szh.sidebar', c ? 'expanded' : 'collapsed'); return !c; }),
    assistantOpen,
    setAssistantOpen: (v) => { localStorage.setItem('szh.assistant', v ? 'open' : 'closed'); setAssistantOpenState(v); },
    paletteOpen, setPaletteOpen, crumbs, setCrumbs, context, setContext,
  }), [collapsed, assistantOpen, paletteOpen, crumbs, context, threads]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUI() {
  const v = useContext(Ctx);
  if (!v) throw new Error('UIProvider missing');
  return v;
}

/** Pages declare where they are; the title bar and assistant follow. */
export function usePageContext(crumbs: Crumb[], context?: AssistantContext) {
  const { setCrumbs, setContext } = useUI();
  const key = JSON.stringify([crumbs, context]);
  useEffect(() => {
    setCrumbs(crumbs);
    setContext(context ?? { kind: 'general', label: crumbs[crumbs.length - 1]?.label ?? '工作台' });
    document.title = [crumbs[crumbs.length - 1]?.label, 'SZH'].filter(Boolean).join(' · ');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
