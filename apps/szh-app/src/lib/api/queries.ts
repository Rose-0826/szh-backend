import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateRunRequest, Run } from '@/types/domain';
import { isActive } from '@/lib/status';
import { useDataSource } from './datasource';

/** All server state goes through these hooks; components never call the DataSource directly for reads. */

export const keys = {
  health: ['health'] as const,
  solutions: ['solutions'] as const,
  solution: (id: string) => ['solutions', id] as const,
  runs: ['runs'] as const,
  run: (id: string) => ['runs', id] as const,
  conversations: ['conversations'] as const,
  conversation: (id: string) => ['conversations', id] as const,
};

export function useHealth() {
  const { source } = useDataSource();
  return useQuery({ queryKey: keys.health, queryFn: () => source.health(), refetchInterval: 10_000, retry: false });
}

export function useSolutions() {
  const { source } = useDataSource();
  return useQuery({ queryKey: keys.solutions, queryFn: () => source.listSolutions() });
}

export function useSolution(id: string) {
  const { source } = useDataSource();
  return useQuery({ queryKey: keys.solution(id), queryFn: () => source.getSolution(id) });
}

export function useRuns() {
  const { source } = useDataSource();
  return useQuery({
    queryKey: keys.runs, queryFn: () => source.listRuns(),
    refetchInterval: (q) => (q.state.data?.some((r) => isActive(r.status)) ? 2_000 : 15_000),
  });
}

/** Polls while the run is active; Harness has no push channel yet. */
export function useRun(id: string) {
  const { source } = useDataSource();
  return useQuery({
    queryKey: keys.run(id), queryFn: () => source.getRun(id), enabled: Boolean(id),
    refetchInterval: (q) => (q.state.data && isActive(q.state.data.status) ? 1_500 : false),
  });
}

export function useCreateRun() {
  const { source } = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (r: CreateRunRequest) => source.createRun(r),
    onSuccess: (run: Run) => { qc.setQueryData(keys.run(run.id), run); void qc.invalidateQueries({ queryKey: keys.runs }); },
  });
}

export function useCancelRun(id: string) {
  const { source } = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => source.cancelRun(id),
    onSettled: () => { void qc.invalidateQueries({ queryKey: keys.run(id) }); void qc.invalidateQueries({ queryKey: keys.runs }); },
  });
}

export function useCreateConversation() {
  const { source } = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => source.createConversation(content),
    onSuccess: (c) => { qc.setQueryData(keys.conversation(c.id), c); void qc.invalidateQueries({ queryKey: keys.conversations }); },
  });
}

export function useSendMessage(id: string) {
  const { source } = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => source.sendMessage(id, content),
    onSuccess: (c) => { qc.setQueryData(keys.conversation(id), c); void qc.invalidateQueries({ queryKey: keys.conversations }); },
  });
}

export function useStopReply(id: string) {
  const { source } = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => source.stopReply(id),
    onSuccess: (c) => qc.setQueryData(keys.conversation(id), c),
    onSettled: () => { void qc.invalidateQueries({ queryKey: keys.conversation(id) }); },
  });
}

export function useConversations() {
  const { source } = useDataSource();
  return useQuery({ queryKey: keys.conversations, queryFn: () => source.listConversations() });
}

export function useConversation(id: string | undefined) {
  const { source } = useDataSource();
  return useQuery({
    queryKey: keys.conversation(id ?? ''), queryFn: () => source.getConversation(id!), enabled: Boolean(id),
    refetchInterval: (q) => (q.state.data?.messages.some((m) => ['queued', 'running', 'stopping'].includes(m.status)) ? 1_200 : false),
  });
}
