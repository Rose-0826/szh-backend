import type { Artifact, Conversation, Run, RunEvent, RunStatus, Solution, SolutionVersion } from '@/types/domain';
import { ApiError, type DataSource } from './contract';
import { artifactKind } from './harness';
import { validateAgainstSchema } from '@/lib/schema';

/**
 * Mock data source — clearly labelled DEMO data for exercising generic interactions.
 * The two test Solutions really compute their outputs from the user's input in the browser,
 * so every artifact shown is a genuine (if trivial) result, never a canned "success".
 */

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const version = (solutionId: string, v: string, publishedAt: string, extra: Partial<SolutionVersion>): SolutionVersion => ({
  solutionId, version: v, publishedAt, status: 'published', outputSchema: { type: 'object' },
  runtime: { adapter: 'mock-browser', entrypoint: `mock/${solutionId}` }, delivery: {}, assets: [], inputSchema: { type: 'object' }, ...extra,
});

const solutions: Solution[] = [
  {
    id: 'demo-text-stats', name: '文本词频统计', domain: '通用测试', origin: 'mock', latestVersion: '0.2.0',
    tags: ['测试方案', '文本'],
    description: '统计输入文本的字符与词频，输出结构化摘要和词频表。用于验证表单、运行、日志与成果查看的通用流程。',
    versions: [
      version('demo-text-stats', '0.2.0', '2026-11-05T09:00:00Z', {
        validationScope: '仅用于演示通用交互，不代表任何专业能力。',
        delivery: { summary: true, table: true },
        assets: [{ name: '方案说明（README）', kind: 'doc', description: '输入输出约定与限制' }, { name: 'mock/demo-text-stats', kind: 'code', description: '浏览器内执行的演示实现' }],
        inputSchema: {
          type: 'object', required: ['text'], additionalProperties: false,
          properties: {
            text: { type: 'string', title: '待分析文本', description: '粘贴一段文本；包含 “fail” 时会模拟执行失败，用于检查错误处理。', minLength: 5, maxLength: 20000, 'x-widget': 'textarea' },
            top_k: { type: 'integer', title: '输出词数', minimum: 1, maximum: 50, default: 10, 'x-advanced': true },
            lowercase: { type: 'boolean', title: '统一小写', default: true, 'x-advanced': true },
          },
        },
      }),
      version('demo-text-stats', '0.1.0', '2026-10-20T09:00:00Z', {
        inputSchema: { type: 'object', required: ['text'], properties: { text: { type: 'string', title: '待分析文本', minLength: 5, 'x-widget': 'textarea' } } },
      }),
    ],
  },
  {
    id: 'demo-curve-fit', name: '最小二乘曲线拟合', domain: '数值方法', origin: 'mock', latestVersion: '0.1.0',
    tags: ['测试方案', '拟合'],
    description: '对输入的二维数据点做线性或二次最小二乘拟合，输出系数、残差表与拟合图。',
    versions: [
      version('demo-curve-fit', '0.1.0', '2026-11-01T09:00:00Z', {
        validationScope: '演示用小规模数值计算。', delivery: { figure: true, table: true },
        inputSchema: {
          type: 'object', required: ['points', 'model'], additionalProperties: false,
          properties: {
            points: { type: 'string', title: '数据点', description: '每行一个点：x,y（至少 3 行）', minLength: 11, 'x-widget': 'textarea', default: '0,1.1\n1,2.9\n2,5.2\n3,6.8\n4,9.1\n5,10.9' },
            model: { type: 'string', title: '拟合模型', enum: ['linear', 'quadratic'], default: 'linear' },
            step_delay: { type: 'number', title: '模拟耗时', minimum: 0.2, maximum: 5, default: 0.8, 'x-unit': 's / 步', 'x-advanced': true },
          },
        },
      }),
    ],
  },
];

/* ---------- executors: real computation on the given input ---------- */

type Output = { name: string; content: string; type: string };
type Exec = (input: Record<string, unknown>, log: (m: string) => void) => Promise<Output[]>;

const executors: Record<string, Exec> = {
  'demo-text-stats': async (input, log) => {
    let text = String(input.text ?? '');
    if (/fail/i.test(text)) { log('检测到测试关键字 “fail”'); await delay(600); throw new Error('演示失败：输入包含测试关键字 “fail”。'); }
    if (input.lowercase !== false) text = text.toLowerCase();
    log(`读取输入：${text.length} 个字符`); await delay(700);
    const words = text.match(/[\p{L}\p{N}]+/gu) ?? [];
    log(`分词完成：${words.length} 个词`); await delay(700);
    const counts = new Map<string, number>();
    words.forEach((w) => counts.set(w, (counts.get(w) ?? 0) + 1));
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, Number(input.top_k ?? 10));
    log(`统计完成：${counts.size} 个不同词`); await delay(500);
    return [
      { name: 'summary.json', type: 'application/json', content: JSON.stringify({ characters: text.length, words: words.length, unique_words: counts.size, top }, null, 2) },
      { name: 'word_counts.csv', type: 'text/csv', content: 'word,count\n' + top.map(([w, c]) => `${w},${c}`).join('\n') },
    ];
  },
  'demo-curve-fit': async (input, log) => {
    const step = Number(input.step_delay ?? 0.8) * 1000;
    const pts = String(input.points).trim().split(/\n+/).map((l) => l.split(',').map(Number)).filter((p) => p.length === 2 && p.every(Number.isFinite));
    log(`解析数据点：${pts.length} 个有效点`); await delay(step);
    if (pts.length < 3) throw new Error('有效数据点少于 3 个，无法拟合。');
    const degree = input.model === 'quadratic' ? 2 : 1;
    const coef = leastSquares(pts, degree);
    log(`求解正规方程（${degree} 次）`); await delay(step);
    const predict = (x: number) => coef.reduce((s, c, i) => s + c * x ** i, 0);
    const residuals = pts.map(([x, y]) => [x, y, predict(x), y - predict(x)]);
    const ssr = residuals.reduce((s, r) => s + r[3] ** 2, 0);
    const mean = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const sst = pts.reduce((s, p) => s + (p[1] - mean) ** 2, 0);
    log(`计算残差与 R²`); await delay(step);
    log('绘制拟合图'); await delay(step / 2);
    return [
      { name: 'fit.json', type: 'application/json', content: JSON.stringify({ model: input.model, coefficients: coef, r2: sst ? 1 - ssr / sst : null, n: pts.length }, null, 2) },
      { name: 'residuals.csv', type: 'text/csv', content: 'x,y,y_hat,residual\n' + residuals.map((r) => r.map((v) => +v.toFixed(6)).join(',')).join('\n') },
      { name: 'fit.svg', type: 'image/svg+xml', content: plotSvg(pts, predict) },
    ];
  },
};

function leastSquares(points: number[][], degree: number): number[] {
  const n = degree + 1;
  const A = Array.from({ length: n }, (_, i) => Array.from({ length: n + 1 }, (_, j) =>
    j < n ? points.reduce((s, [x]) => s + x ** (i + j), 0) : points.reduce((s, [x, y]) => s + y * x ** i, 0)));
  for (let i = 0; i < n; i++) {
    let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]];
    for (let r = 0; r < n; r++) if (r !== i) { const f = A[r][i] / A[i][i]; for (let c = i; c <= n; c++) A[r][c] -= f * A[i][c]; }
  }
  return A.map((row, i) => +(row[n] / row[i]).toPrecision(8));
}

function plotSvg(points: number[][], f: (x: number) => number) {
  const W = 560, H = 320, P = 40;
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)], [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const sx = (x: number) => P + ((x - x0) / (x1 - x0 || 1)) * (W - 2 * P);
  const sy = (y: number) => H - P - ((y - y0) / (y1 - y0 || 1)) * (H - 2 * P);
  const line = Array.from({ length: 50 }, (_, i) => { const x = x0 + ((x1 - x0) * i) / 49; return `${sx(x).toFixed(1)},${sy(f(x)).toFixed(1)}`; }).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="Segoe UI, sans-serif" font-size="11">
<rect width="${W}" height="${H}" fill="#fff"/><line x1="${P}" y1="${H - P}" x2="${W - P}" y2="${H - P}" stroke="#C9CED6"/><line x1="${P}" y1="${P}" x2="${P}" y2="${H - P}" stroke="#C9CED6"/>
<text x="${P}" y="${H - P + 16}" fill="#667085">${x0}</text><text x="${W - P}" y="${H - P + 16}" fill="#667085" text-anchor="end">${x1}</text>
<text x="${P - 6}" y="${H - P}" fill="#667085" text-anchor="end">${y0}</text><text x="${P - 6}" y="${P + 4}" fill="#667085" text-anchor="end">${y1}</text>
<polyline points="${line}" fill="none" stroke="#2D61C8" stroke-width="2"/>
${points.map(([x, y]) => `<circle cx="${sx(x)}" cy="${sy(y)}" r="3.5" fill="#fff" stroke="#172235" stroke-width="1.5"/>`).join('')}
</svg>`;
}

/* ---------- in-memory store ---------- */

type Stored = Run & { files: Map<string, Output> };
const runs = new Map<string, Stored>();
const controllers = new Map<string, { cancelled: boolean }>();
const blobUrls = new Map<string, string>();
const conversations = new Map<string, Conversation>();

function snapshot(run: Stored): Run {
  const { files: _files, ...rest } = run;
  return structuredClone(rest);
}

function push(run: Stored, event: Omit<RunEvent, 'at'>) { run.events.push({ at: now(), ...event }); }
function setStatus(run: Stored, status: RunStatus, message: string) { run.status = status; push(run, { kind: 'status', status, message }); }

async function execute(run: Stored) {
  const control = controllers.get(run.id)!;
  await delay(900);
  if (control.cancelled) { setStatus(run, 'cancelled', '已取消'); run.finishedAt = now(); return; }
  run.startedAt = now(); setStatus(run, 'running', '开始执行');
  try {
    const outputs = await executors[run.solutionId](run.input, (m) => {
      if (control.cancelled) throw new Error('__cancelled__');
      push(run, { kind: 'log', message: m });
    });
    if (control.cancelled) throw new Error('__cancelled__');
    const log = run.events.filter((e) => e.kind === 'log').map((e) => `[${e.at}] ${e.message}`).join('\n');
    for (const o of [...outputs, { name: 'execution.log', type: 'text/plain', content: log }]) {
      const artifact: Artifact = { id: uid(), runId: run.id, name: o.name, size: new Blob([o.content]).size, kind: artifactKind(o.name) };
      run.artifacts.push(artifact); run.files.set(artifact.id, o);
      push(run, { kind: 'artifact', message: `生成 ${o.name}` });
    }
    setStatus(run, 'succeeded', `执行完成，生成 ${run.artifacts.length} 个成果文件`);
  } catch (error) {
    if (control.cancelled || (error as Error).message === '__cancelled__') setStatus(run, 'cancelled', '已取消');
    else { run.status = 'failed'; run.error = (error as Error).message; push(run, { kind: 'error', status: 'failed', message: run.error }); }
  } finally { run.finishedAt = now(); controllers.delete(run.id); }
}

export function createMockDataSource(): DataSource {
  const find = (id: string) => { const s = solutions.find((x) => x.id === id); if (!s) throw new ApiError('solution_not_found', '未找到该方案。', 404); return s; };
  const findRun = (id: string) => { const r = runs.get(id); if (!r) throw new ApiError('run_not_found', '未找到运行记录。', 404); return r; };
  const latency = () => delay(250 + Math.random() * 250);

  return {
    kind: 'mock',
    async health() { await latency(); return { online: true, modelConfigured: false, checkedAt: now() }; },
    async listSolutions() { await latency(); return structuredClone(solutions); },
    async getSolution(id) { await latency(); return structuredClone(find(id)); },
    async validateInput(solutionId, v, input) {
      await delay(500);
      const sv = find(solutionId).versions.find((x) => x.version === v);
      if (!sv) throw new ApiError('version_not_found', '未找到指定方案版本。', 404);
      const fieldErrors = validateAgainstSchema(sv.inputSchema, input);
      return Object.keys(fieldErrors).length ? { valid: false, message: '输入未通过校验', fieldErrors } : { valid: true };
    },
    async listRuns() { await latency(); return [...runs.values()].map(snapshot).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); },
    async getRun(id) { await delay(120); return snapshot(findRun(id)); },
    async createRun(r) {
      await latency();
      const existing = [...runs.values()].find((x) => (x as Stored & { requestId?: string }).requestId === r.requestId);
      if (existing) return snapshot(existing);
      const solution = find(r.solutionId);
      const sv = solution.versions.find((x) => x.version === r.version);
      if (!sv) throw new ApiError('version_not_found', '未找到指定方案版本。', 404);
      const errors = validateAgainstSchema(sv.inputSchema, r.input);
      if (Object.keys(errors).length) throw new ApiError('invalid_input', '输入未通过校验。', 400);
      const run: Stored & { requestId: string } = {
        id: uid(), requestId: r.requestId, solutionId: r.solutionId, solutionName: solution.name, version: r.version, status: 'queued',
        input: structuredClone(r.input), createdAt: now(), events: [], artifacts: [], sourceRunId: r.sourceRunId, origin: 'mock', files: new Map(),
      };
      push(run, { kind: 'status', status: 'queued', message: '已创建并进入队列' });
      runs.set(run.id, run); controllers.set(run.id, { cancelled: false });
      void execute(run);
      return snapshot(run);
    },
    async cancelRun(id) {
      await latency();
      const run = findRun(id), control = controllers.get(id);
      if (!control) throw new ApiError('invalid_run_state', '该运行已结束。', 400);
      control.cancelled = true; setStatus(run, 'cancel_requested', '已请求取消');
    },
    artifactUrl(a) {
      const file = findRun(a.runId).files.get(a.id);
      if (!file) return '';
      if (!blobUrls.has(a.id)) blobUrls.set(a.id, URL.createObjectURL(new Blob([file.content], { type: file.type })));
      return blobUrls.get(a.id)!;
    },
    async readArtifactText(a) { await delay(150); const f = findRun(a.runId).files.get(a.id); if (!f) throw new ApiError('artifact_not_found', '未找到成果文件。', 404); return f.content; },
    async listConversations() { await latency(); return [...conversations.values()].map((c) => structuredClone(c)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); },
    async getConversation(id) { await delay(120); const c = conversations.get(id); if (!c) throw new ApiError('task_not_found', '未找到该对话。', 404); return structuredClone(c); },
    async createConversation(content) {
      const c: Conversation = { id: uid(), title: content.split('\n')[0].slice(0, 60), updatedAt: now(), messages: [], origin: 'mock' };
      conversations.set(c.id, c);
      return this.sendMessage(c.id, content);
    },
    async sendMessage(id, content) {
      await latency();
      const c = conversations.get(id); if (!c) throw new ApiError('task_not_found', '未找到该对话。', 404);
      const last = c.messages.at(-1);
      if (last && ['queued', 'running', 'stopping'].includes(last.status)) throw new ApiError('reply_in_progress', '正在处理上一条消息。', 409);
      const m: Conversation['messages'][number] = { id: uid(), content, status: 'running', createdAt: now(), reply: null };
      c.messages.push(m); c.updatedAt = now();
      setTimeout(() => {
        if (m.status !== 'running') return;
        Object.assign(m, { status: 'completed', reply: '（演示回复，未调用模型）已收到你的问题。演示模式不会生成科研结论；如需执行计算，请在方案页配置输入并确认运行。' });
        c.updatedAt = now();
      }, 1400);
      return structuredClone(c);
    },
    async stopReply(id) {
      await latency();
      const c = conversations.get(id); if (!c) throw new ApiError('task_not_found', '未找到该对话。', 404);
      const m = c.messages.at(-1);
      if (!m || !['queued', 'running'].includes(m.status)) throw new ApiError('invalid_message_state', '当前没有正在生成的回复。', 409);
      m.status = 'stopped'; c.updatedAt = now();
      return structuredClone(c);
    },
  };
}
