import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { validateInput, ProtocolError } from './solution-registry.mjs';

export class RunService {
  static async open(directory, registry, execute) {
    const service = new RunService(directory, registry, execute);
    await mkdir(directory, { recursive: true });
    for (const name of await readdir(directory)) {
      if (!name.endsWith('.json')) continue;
      const run = JSON.parse(await readFile(join(directory, name), 'utf8'));
      if (['queued', 'running', 'cancel_requested'].includes(run.status)) {
        run.status = 'failed'; run.error = '服务中断，请重新运行。';
        await service.save(run);
      }
      service.runs.set(run.id, run);
    }
    return service;
  }
  constructor(directory, registry, execute) { this.directory = directory; this.registry = registry; this.execute = execute; this.runs = new Map(); this.active = new Map(); this.pending = Promise.resolve(); this.executionQueue = Promise.resolve(); }
  async save(run) {
    const target = join(this.directory, run.id + '.json');
    await writeFile(target + '.tmp', JSON.stringify(run, null, 2)); await rename(target + '.tmp', target);
  }
  list() { return structuredClone([...this.runs.values()].sort((a,b) => b.created_at.localeCompare(a.created_at))); }
  get(id) { const run = this.runs.get(id); if (!run) throw new ProtocolError('run_not_found', '未找到运行记录。'); return structuredClone(run); }
  async create(request) {
    const operation = this.pending.then(() => this.createOne(request));
    this.pending = operation.catch(() => {}); return operation;
  }
  async createOne({ solution_id, version, input, request_id, source_run_id }) {
    if (typeof request_id !== 'string' || !request_id.trim()) throw new ProtocolError('request_id_required', '缺少提交编号。');
    const fingerprint = JSON.stringify({ solution_id, version, input, source_run_id });
    const existing = [...this.runs.values()].find(run => run.request_id === request_id);
    if (existing) { if (existing.fingerprint !== fingerprint) throw new ProtocolError('request_conflict', '提交编号已用于不同输入。'); return structuredClone(existing); }
    const record = await this.registry.get(solution_id, version);
    validateInput(record.manifest, input);
    if (source_run_id) this.get(source_run_id);
    if (!this.execute) throw new ProtocolError('runtime_unavailable', '推理环境尚未配置。');
    const run = { id: randomUUID(), solution_id, version, manifest: record.manifest, input, request_id, fingerprint, source_run_id, status: 'queued', created_at: new Date().toISOString(), events: [], artifacts: [] };
    this.runs.set(run.id, run); await this.save(run);
    const controller = new AbortController(); this.active.set(run.id, controller);
    this.executionQueue = this.executionQueue.then(() => this.perform(run, controller)).catch(error => { console.error('Run persistence failed:', error.message); });
    return structuredClone(run);
  }
  async perform(run, controller) {
    const output = join(this.directory, run.id); await mkdir(output, { recursive: true });
    try {
      if (controller.signal.aborted) { run.status = 'cancelled'; return; }
      run.status = 'running'; run.started_at = new Date().toISOString(); await this.save(run);
      await this.execute(run, output, controller.signal);
      if (controller.signal.aborted) { run.status = 'cancelled'; }
      else {
        for (const name of await readdir(output)) {
          const bytes = await readFile(join(output, name));
          run.artifacts.push({ id: randomUUID(), run_id: run.id, name, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
        }
        run.status = 'succeeded';
      }
    } catch (error) { run.status = controller.signal.aborted ? 'cancelled' : 'failed'; run.error = error.message; }
    finally { run.finished_at = new Date().toISOString(); this.active.delete(run.id); await this.save(run); }
  }
  async cancel(id) {
    const snapshot = this.get(id), controller = this.active.get(id);
    if (!controller) throw new ProtocolError('invalid_run_state', '该运行已结束。');
    controller.abort(); return { ...snapshot, status: 'cancel_requested' };
  }
  async artifact(id, artifactId) {
    const run = this.get(id), artifact = run.artifacts.find(item => item.id === artifactId);
    if (!artifact) throw new ProtocolError('artifact_not_found', '未找到成果文件。');
    return { artifact, bytes: await readFile(join(this.directory, id, artifact.name)) };
  }
}
export function aicExecutor({ python, packageRoot, script }) {
  return async (run, output, signal) => {
    if (run.manifest.runtime.adapter !== 'aic-packaged-inference') throw new ProtocolError('unsupported_adapter', '未安装该执行适配器。');
    await new Promise((resolve, reject) => {
      const child = spawn(python, [script, '--package', packageRoot, '--case', run.input.case_id, '--output', output, '--device', 'cpu'], { signal, windowsHide: true });
      let log = '';
      child.stdout.on('data', data => { log += data; }); child.stderr.on('data', data => { log += data; });
      child.once('error', reject);
      child.once('close', async code => {
        try { await writeFile(join(output, 'execution.log'), log); if (code === 0) resolve(); else reject(new Error(`推理执行失败（${code}），请查看执行日志。`)); } catch (error) { reject(error); }
      });
    });
  };
}
