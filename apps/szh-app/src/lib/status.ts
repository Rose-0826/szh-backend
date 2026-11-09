import type { RunStatus } from '@/types/domain';

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** Single status vocabulary for the whole app. */
export const runStatusMeta: Record<RunStatus, { label: string; tone: Tone; active: boolean }> = {
  created: { label: '已创建', tone: 'neutral', active: true },
  validating: { label: '校验中', tone: 'info', active: true },
  queued: { label: '排队中', tone: 'neutral', active: true },
  running: { label: '运行中', tone: 'info', active: true },
  waiting_for_input: { label: '等待确认', tone: 'warning', active: true },
  cancel_requested: { label: '正在取消', tone: 'warning', active: true },
  succeeded: { label: '已完成', tone: 'success', active: false },
  failed: { label: '失败', tone: 'danger', active: false },
  cancelled: { label: '已取消', tone: 'neutral', active: false },
};

export const isActive = (s: RunStatus) => runStatusMeta[s]?.active ?? false;
export const canCancel = (s: RunStatus) => s === 'queued' || s === 'running';
