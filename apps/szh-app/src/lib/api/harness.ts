import type {
  Artifact, ArtifactKind, Conversation, CreateRunRequest, Health, JSONSchema, Run, RunEvent, RunStatus, Solution, SolutionVersion, ValidationResult,
} from '@/types/domain';
import { ApiError, type DataSource } from './contract';

/* ---------- transport ---------- */

export function harnessBaseUrl(): string {
  // Electron injects the Harness URL; the web build uses same-origin (/api via proxy or reverse proxy).
  return window.szhDesktop?.harnessUrl ?? '';
}

async function request<T>(path: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<T> {
  let response: Response;
  try {
    response = await fetch(harnessBaseUrl() + path, {
      method: init?.method ?? (init?.body !== undefined ? 'POST' : 'GET'),
      headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init?.signal,
    });
  } catch {
    throw new ApiError('network_unreachable', '无法连接 Harness 服务。请确认本地服务已启动。');
  }
  let payload: { data?: unknown } | undefined;
  try { payload = await response.json(); } catch { /* non-JSON */ }
  if (!response.ok) {
    const data = (payload?.data ?? {}) as { code?: string; message?: string };
    throw new ApiError(data.code ?? 'http_' + response.status, data.message ?? `服务返回错误（${response.status}）。`, response.status);
  }
  return payload?.data as T;
}

/* ---------- mapping: Harness wire format → domain ---------- */

type WireManifest = {
  id: string; version: string; name: string; description: string; domain: string;
  input_schema: JSONSchema; output_schema: JSONSchema; runtime: { adapter: string; entrypoint: string };
  assets?: SolutionVersion['assets']; validation?: { scope?: string }; delivery?: Record<string, unknown>; tags?: string[];
};
type WireRecord = { manifest: WireManifest; status: 'published'; published_at?: string };
type WireArtifact = { id: string; run_id: string; name: string; size: number; sha256?: string };
type WireRun = {
  id: string; solution_id: string; version: string; manifest?: WireManifest; input: Record<string, unknown>;
  status: RunStatus; created_at: string; started_at?: string; finished_at?: string; error?: string;
  events?: unknown[]; artifacts?: WireArtifact[]; source_run_id?: string;
};

export function artifactKind(name: string): ArtifactKind {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  if (['csv', 'tsv'].includes(ext)) return 'table';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'json') return 'json';
  if (['txt', 'md', 'log', 'yaml', 'yml'].includes(ext)) return 'text';
  if (['pt', 'pth', 'onnx', 'ckpt', 'safetensors', 'h5', 'npz', 'npy'].includes(ext)) return 'model';
  if (['zip', 'tar', 'gz', '7z'].includes(ext)) return 'archive';
  return 'binary';
}

function toVersion(record: WireRecord): SolutionVersion {
  const m = record.manifest;
  return {
    solutionId: m.id, version: m.version, publishedAt: record.published_at, status: record.status,
    inputSchema: m.input_schema, outputSchema: m.output_schema, runtime: m.runtime,
    validationScope: m.validation?.scope, delivery: m.delivery ?? {}, assets: m.assets ?? [],
  };
}

function compareSemver(a: string, b: string) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

export function groupSolutions(records: WireRecord[]): Solution[] {
  const map = new Map<string, WireRecord[]>();
  for (const record of records) map.set(record.manifest.id, [...(map.get(record.manifest.id) ?? []), record]);
  return [...map.values()].map((list) => {
    const sorted = [...list].sort((a, b) => compareSemver(b.manifest.version, a.manifest.version));
    const latest = sorted[0].manifest;
    return {
      id: latest.id, name: latest.name, description: latest.description, domain: latest.domain,
      tags: latest.tags ?? [], latestVersion: latest.version, versions: sorted.map(toVersion), origin: 'harness' as const,
    };
  });
}

/** Harness does not emit events yet; derive a factual timeline from its recorded timestamps only. */
function deriveEvents(run: WireRun): RunEvent[] {
  const events: RunEvent[] = [{ at: run.created_at, kind: 'status', status: 'queued', message: '已创建并进入队列' }];
  if (run.started_at) events.push({ at: run.started_at, kind: 'status', status: 'running', message: '开始执行' });
  if (run.finished_at) {
    events.push({ at: run.finished_at, kind: run.status === 'failed' ? 'error' : 'status', status: run.status,
      message: run.status === 'succeeded' ? `执行完成，生成 ${run.artifacts?.length ?? 0} 个成果文件` : run.status === 'failed' ? (run.error ?? '执行失败') : '已取消' });
  }
  return events;
}

export function toRun(run: WireRun): Run {
  return {
    id: run.id, solutionId: run.solution_id, solutionName: run.manifest?.name ?? run.solution_id, version: run.version,
    status: run.status, input: run.input, createdAt: run.created_at, startedAt: run.started_at, finishedAt: run.finished_at,
    error: run.error, events: deriveEvents(run), sourceRunId: run.source_run_id, origin: 'harness',
    artifacts: (run.artifacts ?? []).map((a) => ({ id: a.id, runId: a.run_id, name: a.name, size: a.size, sha256: a.sha256, kind: artifactKind(a.name) })),
  };
}

/** AJV errorsText, e.g. "data/case_id must be equal to one of the allowed values, data must have required property 'x'". */
export function parseAjvErrors(text: string): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const part of text.split(/,\s(?=data)/)) {
    const required = part.match(/required property '([^']+)'/);
    if (required) { errors[required[1]] = '必填'; continue; }
    const field = part.match(/^data\/([^\s/]+)\s+(.*)$/);
    if (field) errors[field[1]] = field[2];
  }
  return errors;
}

type WireTask = { id: string; goal: string; parser_type?: string; updated_at: string; messages?: { id: string; content: string; status: Conversation['messages'][number]['status']; reply?: string | null; error?: string | null; created_at: string }[] };
const toConversation = (t: WireTask): Conversation => ({
  id: t.id, title: t.goal.split('\n')[0].trim() || t.goal, updatedAt: t.updated_at, origin: 'harness',
  messages: (t.messages ?? []).map((m) => ({ id: m.id, content: m.content, status: m.status, reply: m.reply, error: m.error, createdAt: m.created_at })),
});

/* ---------- implementation ---------- */

export function createHarnessDataSource(): DataSource {
  return {
    kind: 'harness',
    async health(): Promise<Health> {
      const data = await request<{ model_configured: boolean; model?: string }>('/api/health');
      return { online: true, modelConfigured: data.model_configured, model: data.model, checkedAt: new Date().toISOString() };
    },
    async listSolutions() { return groupSolutions(await request<WireRecord[]>('/api/v1/solutions')); },
    async getSolution(id) {
      const records = await request<WireRecord[]>(`/api/v1/solutions/${encodeURIComponent(id)}/versions`);
      const [solution] = groupSolutions(records);
      if (!solution) throw new ApiError('solution_not_found', '未找到该方案，可能尚未发布。', 404);
      return solution;
    },
    async validateInput(solutionId, version, input): Promise<ValidationResult> {
      try {
        await request(`/api/v1/solutions/${solutionId}/versions/${version}/validate-input`, { body: input });
        return { valid: true };
      } catch (error) {
        if (error instanceof ApiError && error.code === 'invalid_input') return { valid: false, message: error.message, fieldErrors: parseAjvErrors(error.message) };
        throw error;
      }
    },
    async listRuns() { return (await request<WireRun[]>('/api/v1/runs')).map(toRun); },
    async getRun(id) { return toRun(await request<WireRun>(`/api/v1/runs/${id}`)); },
    async createRun(r: CreateRunRequest) {
      return toRun(await request<WireRun>('/api/v1/runs', { body: { solution_id: r.solutionId, version: r.version, input: r.input, request_id: r.requestId, source_run_id: r.sourceRunId } }));
    },
    async cancelRun(id) { await request(`/api/v1/runs/${id}/cancel`, { method: 'POST', body: {} }); },
    artifactUrl: (a: Artifact) => `${harnessBaseUrl()}/api/v1/runs/${a.runId}/artifacts/${a.id}/download`,
    async readArtifactText(a, maxBytes = 512_000) {
      let response: Response;
      try { response = await fetch(`${harnessBaseUrl()}/api/v1/runs/${a.runId}/artifacts/${a.id}/download`); }
      catch { throw new ApiError('network_unreachable', '无法连接 Harness 服务。'); }
      if (!response.ok) throw new ApiError('artifact_unavailable', '成果文件暂时无法读取。', response.status);
      const text = await response.text();
      return text.length > maxBytes ? text.slice(0, maxBytes) : text;
    },
    async listConversations() {
      const tasks = await request<WireTask[]>('/api/tasks');
      return tasks.filter((t) => t.parser_type === 'general').map(toConversation).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async getConversation(id) { return toConversation(await request<WireTask>(`/api/tasks/${id}`)); },
    async createConversation(content) { return toConversation(await request<WireTask>('/api/tasks', { body: { solution_id: 'general', content } })); },
    async sendMessage(id, content) { return toConversation(await request<WireTask>(`/api/tasks/${id}/messages`, { body: { content } })); },
    async stopReply(id) { return toConversation(await request<WireTask>(`/api/tasks/${id}/messages/stop`, { method: 'POST', body: {} })); },
  };
}
