import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DataSource } from './contract';
import { createHarnessDataSource } from './harness';
import { createMockDataSource } from './mock';

type Kind = DataSource['kind'];
const STORAGE_KEY = 'szh.dataSource';

/** Who validates, executes and reports — UI copy must never credit Harness for demo behaviour. */
// Used inline in Chinese sentences, so the Latin name carries its own spacing.
export const backendName = (kind: Kind) => (kind === 'mock' ? '演示数据源' : ' Harness ');

function initialKind(): Kind {
  const fromUrl = new URLSearchParams(location.search).get('data');
  if (fromUrl === 'mock' || fromUrl === 'harness') return fromUrl;
  return localStorage.getItem(STORAGE_KEY) === 'mock' ? 'mock' : 'harness';
}

const Ctx = createContext<{ source: DataSource; kind: Kind; setKind: (k: Kind) => void } | null>(null);

export function DataSourceProvider({ children }: { children: ReactNode }) {
  const [kind, setKindState] = useState<Kind>(initialKind);
  const source = useMemo(() => (kind === 'mock' ? createMockDataSource() : createHarnessDataSource()), [kind]);
  // A fresh cache per source guarantees mock and real data are never mixed on screen.
  const client = useMemo(() => new QueryClient({
    defaultOptions: { queries: { retry: (n, e: unknown) => (e as { status?: number }).status === 404 ? false : n < 1, staleTime: 5_000, refetchOnWindowFocus: true } },
  }), [kind]);
  const setKind = (k: Kind) => { localStorage.setItem(STORAGE_KEY, k); setKindState(k); };
  return (
    <Ctx.Provider value={{ source, kind, setKind }}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </Ctx.Provider>
  );
}

export function useDataSource() {
  const value = useContext(Ctx);
  if (!value) throw new Error('DataSourceProvider missing');
  return value;
}
