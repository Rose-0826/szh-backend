import { mkdir, readdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runDsh, runDshConversation } from './dsh-runner.mjs';
import { checkParsing } from './parsing.mjs';
import { projectRoot } from './config.mjs';
import {getNotamProfile} from './notam-profiles.mjs';
import { activityEvent, readArchivedActivity } from './task-activity.mjs';
import { AicMaterialsError, loadAicCatalog, runAicEntry } from './aic-entry.mjs';

export class TaskError extends Error {
  constructor(code, message, status = 409) { super(message); this.code = code; this.status = status; }
}

const failureMessages = {
  model_quota_exhausted: '模型服务余额不足或无可用资源包，请配置可用额度后继续。',
  model_not_configured: '尚未配置可用的模型地址与Key。',
  model_timeout: '本次模型调用已达到时间上限。',
  model_turn_incomplete: '模型未完成本次解析，详细原因保存在运行记录中。',
  model_tools_incomplete: '模型未完成所需的字段或资料工具调用，请查看运行记录后继续。',
};
const now = () => new Date().toISOString();

export class TaskService {
  static async open({ directory = join(projectRoot, 'var'), runner = runDsh, chatRunner = runDshConversation, executionMode = 'dsh', aicGate, aicRunner } = {}) {
    const service = new TaskService(directory, runner, executionMode, chatRunner);
    service.aicGate = aicGate;
    service.aicRunner = aicRunner;
    await mkdir(join(directory, 'tasks'), { recursive: true });
    for (const file of await readdir(join(directory, 'tasks'))) {
      if (!file.endsWith('.json')) continue;
      const task = JSON.parse(await readFile(join(directory, 'tasks', file), 'utf8'));
      let changed = false;
      if (['running', 'queued', 'stopping'].includes(task.status)) {
        task.status = 'interrupted';
        task.error = { code: 'service_interrupted', message: '上次服务中断，可以继续未完成的任务。' };
        changed = true;
      }
      for (const message of task.messages || []) if (['running', 'queued', 'stopping'].includes(message.status)) {
        message.status = 'interrupted';
        message.error = '上次回复中断，已有对话已保留，可以重新发送。';
        changed = true;
      }
      if (changed) await service.save(task);
      service.tasks.set(task.id, task);
    }
    return service;
  }

  constructor(directory, runner, executionMode, chatRunner) {
    this.directory = directory;
    this.runner = runner;
    this.chatRunner = chatRunner;
    this.executionMode = executionMode;
    this.tasks = new Map();
    this.queue = [];
    this.draining = false;
    this.active = null;
    this.closing = false;
    this.saves = new Map();
    this.archivedActivity = new Map();
  }

  async save(task) {
    task.updated_at = now();
    const path = join(this.directory, 'tasks', `${task.id}.json`);
    // Each saved snapshot is replaced as a whole so a restart sees complete JSON.
    const temporary = `${path}.${randomUUID()}.tmp`;
    const snapshot = JSON.stringify(task, null, 2);
    const writing = (this.saves.get(task.id) || Promise.resolve()).then(async () => {
      await writeFile(temporary, snapshot);
      await rename(temporary, path);
    });
    this.saves.set(task.id, writing);
    await writing;
  }

  get(id) {
    const task = this.tasks.get(id);
    if (!task) throw new TaskError('task_not_found', '未找到该任务。', 404);
    return structuredClone(task);
  }

  list() {
    return [...this.tasks.values()].map(({ id, goal, status, solution, parser_type, aic_mode, notam_id, updated_at, error }) => ({ id, goal, status, solution, parser_type, aic_mode, notam_id, updated_at, error }));
  }

  async activity(id) {
    const task = this.get(id);
    if (task.activity?.length) return task.activity;
    if (!task.runtime?.session_id) return [];
    if (!this.archivedActivity.has(id)) this.archivedActivity.set(id, readArchivedActivity(this.directory, task.runtime.session_id));
    return structuredClone(await this.archivedActivity.get(id));
  }

  async create(input) {
    if (input.solution_id === 'general') {
      if (typeof input.content !== 'string' || !input.content.trim() || input.content.length > 10000)
        throw new TaskError('invalid_message', '请输入1—10000字符的消息。', 422);
      const task = {
        id: randomUUID(), goal: input.content.trim().slice(0, 60),
        created_at: now(), updated_at: now(), notam: '', notam_id: null,
        parser_type: 'general', solution: null, work_mode: 'research',
        timeout_seconds: 300, execution_mode: this.executionMode,
        status: 'ready', steps: [], attempts: [], result: null, checks: null,
        error: null, plan: [], messages: [],
      };
      this.tasks.set(task.id, task);
      await this.save(task);
      return this.sendMessage(task.id, { content: input.content });
    }
    if (input.solution_id === 'aic-flowproxy' || input.solution === 'aic-flowproxy') return this.createAic(input);
    if (input.solution_id !== undefined && input.solution_id !== 'aviation-notam') throw new TaskError('unsupported_solution', '当前只接入航行通告解析和AIC流相重建。', 422);
    if (typeof input.notam !== 'string' || !input.notam.trim() || input.notam.length > 30000) throw new TaskError('invalid_notam', '请提供1—30000字符的NOTAM报文。', 422);
    const parserType = input.parser_type || 'runway';
    let profile;
    try {profile = getNotamProfile(parserType);} catch {throw new TaskError('unsupported_parser', '请选择论文跑道解析或研究报告业务解析。', 422);}
    if (input.notam_id !== undefined && (typeof input.notam_id !== 'string' || input.notam_id.length > 100 || /[\r\n]/.test(input.notam_id))) throw new TaskError('invalid_notam_id', '报文编号应为不超过100字符的单行文本。', 422);
    const timeout = input.timeout_seconds ?? 180;
    if (!Number.isInteger(timeout) || timeout < 10 || timeout > 300) throw new TaskError('invalid_budget', '单次时间上限应为10—300秒的整数。', 422);
    const task = {
      id: randomUUID(), goal: '将NOTAM解析为结构化JSON：' + profile.name,
      created_at: now(), updated_at: now(),
      notam: input.notam.trim(), notam_id: input.notam_id?.trim() || null, parser_type: parserType,
      solution: { id: 'aviation-notam', version: '0.1.0', schema_version: profile.schemaVersion },
      work_mode: 'engineering', timeout_seconds: timeout,
      execution_mode: this.executionMode, runtime_executed: false,
      status: 'awaiting_confirmation',
      plan: ['读取' + profile.name + '的字段和已有资料规则', '通过DSH调用解析模型并查询官方资料', parserType === 'report' ? '核对机场、限制与例外、设施及B/C/D时间' : '检查五字段、起降默认值与原文明示编号', '保存结果、原文定位与运行记录'],
      steps: [], attempts: [], result: null, checks: null, error: null,
      professional_review: 'pending',
    };
    this.tasks.set(task.id, task);
    await this.save(task);
    return this.get(task.id);
  }

  async createAic(input) {
    const timeout = input.timeout_seconds ?? 180;
    if (!Number.isInteger(timeout) || timeout < 10 || timeout > 300) throw new TaskError('invalid_budget', '单次时间上限应为10—300秒的整数。', 422);
    if (input.note !== undefined && (typeof input.note !== 'string' || input.note.length > 10000)) throw new TaskError('invalid_note', '补充说明应为不超过10000字符的文本。', 422);
    let catalog;
    try { catalog = await loadAicCatalog(); }
    catch (error) { if (error instanceof AicMaterialsError) throw new TaskError(error.code, error.message, 422); throw error; }
    const known = catalog.rows.map((row) => row.case_id);
    const requested = input.case_ids === undefined ? catalog.example.cases.map((item) => item.case_id) : input.case_ids;
    if (!Array.isArray(requested) || requested.length === 0 || requested.length > 12 || requested.some((caseId) => typeof caseId !== 'string' || !known.includes(caseId))) {
      throw new TaskError('unknown_case', '请从确认批12例中选择工况。', 422);
    }
    const caseIds = [...new Set(requested)];
    const task = {
      id: randomUUID(), goal: 'AIC流相：周期绕流场重建',
      created_at: now(), updated_at: now(),
      notam: input.note?.trim() || `AIC流相重建：${caseIds.join('，')}`,
      notam_id: null, parser_type: 'flow-reconstruction', case_ids: caseIds,
      solution: { id: 'aic-flowproxy', version: '0.1.0', schema_version: 'aic-flowproxy-task-result-v0.1' },
      aic_mode: input.aic_mode === 'current_week' ? 'current_week' : 'historical',
      work_mode: 'research', timeout_seconds: timeout,
      execution_mode: this.executionMode, runtime_executed: false, model_called: false,
      status: 'awaiting_confirmation',
      plan: input.aic_mode === 'current_week' ? ['读取本周正式基线和 4 组候选记录', '核对开发集选用和确认批逐例指标', '挂接本周流场图、完整预测和复跑材料'] : ['核对76个观测值和确认批样例', '装载历史父版基线与候选配置', '返回逐例指标、耗时状态和过程记录', '挂接对照图、输入和指标文件'],
      steps: [], attempts: [], result: null, checks: null, error: null,
      professional_review: 'pending', artifact_names: [],
    };
    this.tasks.set(task.id, task);
    await this.save(task);
    return this.get(task.id);
  }

  async start(id, resume = false) {
    const task = this.tasks.get(id);
    this.get(id);
    const accepted = resume ? ['stopped', 'interrupted', 'failed', 'invalid_output'] : ['awaiting_confirmation'];
    if (!accepted.includes(task.status)) throw new TaskError('invalid_task_state', '当前状态不能执行此操作。');
    if (this.closing) throw new TaskError('service_closing', '服务正在结束，请稍后继续。', 503);
    task.reuse_checkpoint = resume && task.checks?.valid !== false;
    task.data_origin = 'live_run';
    task.checks = null;
    task.result = null;
    task.runtime = null;
    task.runtime_executed = false;
    task.status = 'queued';
    task.error = null;
    await this.save(task);
    this.queue.push({ id });
    void this.drain();
    return this.get(id);
  }

  async sendMessage(id, input) {
    const task = this.tasks.get(id);
    this.get(id);
    if (typeof input.content !== 'string' || !input.content.trim() || input.content.length > 10000) throw new TaskError('invalid_message', '请输入1—10000字符的消息。', 422);
    if (this.closing) throw new TaskError('service_closing', '服务正在结束，请稍后再发送。', 503);
    if (['queued', 'running', 'stopping'].includes(task.messages?.at(-1)?.status)) throw new TaskError('reply_in_progress', '正在处理上一条消息，可以先在输入框中准备下一条。');
    const message = { id: randomUUID(), content: input.content.trim(), status: 'queued', created_at: now(), activity: [], reply: null, error: null };
    (task.messages ||= []).push(message);
    await this.save(task);
    this.queue.push({ id, messageId: message.id });
    void this.drain();
    return this.get(id);
  }

  async stopMessage(id) {
    const task = this.tasks.get(id);
    this.get(id);
    const message = task.messages?.at(-1);
    if (!['queued', 'running', 'stopping'].includes(message?.status)) throw new TaskError('invalid_message_state', '当前没有正在生成的回复。');
    const active = this.active?.id === id && this.active.messageId === message.id;
    message.status = active ? 'stopping' : 'stopped';
    if (active) this.active.controller.abort();
    await this.save(task);
    return this.get(id);
  }

  async drain() {
    if (this.draining || this.closing) return;
    this.draining = true;
    try {
      while (this.queue.length && !this.closing) {
        const entry = this.queue.shift();
        const task = this.tasks.get(entry.id);
        const message = entry.messageId && task.messages?.find((item) => item.id === entry.messageId);
        if (entry.messageId ? message?.status !== 'queued' : task.status !== 'queued') continue;
        const controller = new AbortController();
        this.active = { id: task.id, messageId: entry.messageId, controller };
        if (message) await this.executeMessage(task, message, controller.signal);
        else await this.execute(task, controller.signal);
        this.active = null;
      }
    } finally { this.draining = false; }
  }

  async executeMessage(task, message, signal) {
    message.status = 'running';
    await this.save(task);
    try {
      const artifactDir = join(this.directory, 'conversations', task.id, message.id);
      await mkdir(artifactDir, { recursive: true });
      const receipt = await this.chatRunner({
        notam: task.notam, notamId: task.notam_id, parserType: task.parser_type || 'runway', artifactDir, dshHome: join(this.directory, 'dsh'), signal, timeoutSeconds: task.timeout_seconds,
        conversation: { content: message.content, result: task.result, plan: task.plan, history: (task.messages || []).filter((previous) => previous.status === 'completed').map((previous) => ({ user: previous.content, assistant: previous.reply })) },
        onEvent: (event) => { const activity = activityEvent(event); if (activity) { message.activity.push(activity); task.updated_at = now(); } },
      });
      if (signal.aborted) throw new Error('run_stopped');
      if (!receipt.raw?.trim()) throw new Error('model_turn_incomplete');
      message.reply = receipt.raw;
      message.activity = receipt.activity || message.activity;
      message.runtime = { session_id: receipt.session_id, model: receipt.model, elapsed_ms: receipt.elapsed_ms };
      message.status = 'completed';
    } catch (error) {
      message.status = this.closing ? 'interrupted' : signal.aborted ? 'stopped' : 'failed';
      message.error = signal.aborted ? '回复已停止，已有对话保留。' : failureMessages[error.message] || '这次回复未完成，可以重新发送。';
    }
    message.finished_at = now();
    await this.save(task);
  }

  async execute(task, signal) {
    if (task.solution?.id === 'aic-flowproxy') return this.executeAic(task, signal);
    task.status = 'running';
    task.activity = [];
    task.steps = [{ id: 'model', status: 'running', summary: '正在读取字段并调用模型。', tool_calls: [] }];
    await this.save(task);
    let artifactDir;
    try {
      let receipt;
      if (task.reuse_checkpoint && task.attempts.length) {
        const previous = task.attempts.at(-1);
        artifactDir = join(this.directory, 'runs', previous.id);
        try { receipt = JSON.parse(await readFile(join(artifactDir, 'model-response.json'), 'utf8')); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      if (!receipt) {
        const attempt = { id: randomUUID(), started_at: now(), status: 'running' };
        task.attempts.push(attempt);
        artifactDir = join(this.directory, 'runs', attempt.id);
        await mkdir(artifactDir, { recursive: true });
        await writeFile(join(artifactDir, 'input.txt'), task.notam);
        await this.save(task);
        receipt = await this.runner({
          notam: task.notam, parserType: task.parser_type || 'runway', notamId: task.notam_id, artifactDir, dshHome: join(this.directory, 'dsh'), signal, timeoutSeconds: task.timeout_seconds,
          onEvent: (event) => {
            if (event.type === 'tool/call') task.steps[0].tool_calls.push({ type: event.type, data: event.data });
            const activity = activityEvent(event);
            if (activity) {
              task.activity.push(activity);
              task.updated_at = now();
            }
          },
        });
        await writeFile(join(artifactDir, 'model-response.json'), JSON.stringify(receipt, null, 2));
      }
      task.runtime_executed = true;
      task.activity = receipt.activity || task.activity;
      task.runtime = { name: receipt.runtime, model: receipt.model, reasoning_effort: receipt.reasoning_effort, session_id: receipt.session_id, elapsed_ms: receipt.elapsed_ms };
      task.steps[0].tool_calls = (receipt.tool_calls || []).map((data) => ({ type: 'tool/call', data }));
      task.steps[0].tool_results = receipt.tool_results || [];
      if (signal.aborted) throw new Error('run_stopped');
      task.steps[0].status = 'completed';
      task.steps[0].summary = task.reuse_checkpoint ? '模型响应已取得，继续检查已保存结果。' : '模型已返回解析结果。';
      task.checks = checkParsing(receipt.raw, task.notam, {parserType: task.parser_type || 'runway', notamId: task.notam_id});
      task.result = task.checks.records;
      await writeFile(join(artifactDir, 'checks.json'), JSON.stringify(task.checks, null, 2));
      await writeFile(join(artifactDir, 'result.json'), JSON.stringify(task.result, null, 2));
      if (signal.aborted) throw new Error('run_stopped');
      task.status = task.checks.valid ? 'completed' : 'invalid_output';
      task.steps.push({ id: 'validation', status: task.checks.valid ? 'completed' : 'failed', summary: task.checks.valid ? 'JSON与已实现的字段检查通过，专业结果待确认。' : '输出未通过检查，请查看具体原因。' });
      task.attempts.at(-1).status = task.status;
      task.attempts.at(-1).finished_at = now();
    } catch (error) {
      task.status = this.closing ? 'interrupted' : signal.aborted ? 'stopped' : 'failed';
      const code = signal.aborted ? 'run_stopped' : Object.hasOwn(failureMessages, error.message) ? error.message : 'execution_failed';
      task.error = { code, message: signal.aborted ? '任务已停止，已有记录保留。' : failureMessages[code] || '执行未完成，请查看服务运行记录。' };
      if (task.attempts.length) {
        task.attempts.at(-1).status = task.status;
        task.attempts.at(-1).finished_at = now();
      }
      if (task.steps[0].status !== 'completed') {
        task.steps[0].status = task.status;
        task.steps[0].summary = task.error.message;
      } else {
        task.steps.push({ id: 'delivery', status: task.status, summary: task.error.message });
      }
    }
    task.reuse_checkpoint = false;
    await this.save(task);
  }

  async executeAic(task, signal) {
    task.status = 'running';
    task.model_called = false;
    task.steps = [{ id: 'aic-entry', status: 'running', summary: '正在读取AIC样例、候选配置和指标。' }];
    const attempt = { id: randomUUID(), started_at: now(), status: 'running' };
    task.attempts.push(attempt);
    await this.save(task);
    const artifactDir = join(this.directory, 'runs', attempt.id);
    await mkdir(artifactDir, { recursive: true });
    try {
      const outcome = await runAicEntry({ task, artifactDir, signal, gate: this.aicGate, runner: this.aicRunner });
      if (signal.aborted) throw new Error('run_stopped');
      task.result = outcome.payload;
      task.checks = outcome.payload.checks;
      task.artifact_names = outcome.names;
      task.runtime_executed = true;
      task.model_called = false;
      const weekly = outcome.payload.record_type === 'current_week_result';
      task.data_origin = weekly ? 'archived_gpu_run' : 'historical_catalog';
      task.runtime = { name: weekly ? 'aic-archived-gpu-run' : 'aic-historical-catalog', model: null, model_called: false, elapsed_ms: outcome.elapsed_ms };
      task.steps = outcome.payload.process;
      task.status = outcome.payload.checks.valid ? 'completed' : 'invalid_output';
      task.error = null;
    } catch (error) {
      const stopped = signal.aborted || error.message === 'run_stopped';
      task.status = this.closing ? 'interrupted' : stopped ? 'stopped' : 'failed';
      task.error = {
        code: stopped ? 'run_stopped' : error.code || 'execution_failed',
        message: stopped ? '任务已停止，已有记录保留。' : error.message || 'AIC执行入口未完成。',
      };
      task.result = null;
      if (task.steps[0]) {
        task.steps[0].status = task.status;
        task.steps[0].summary = task.error.message;
      }
    }
    attempt.status = task.status;
    attempt.finished_at = now();
    task.reuse_checkpoint = false;
    await this.save(task);
  }

  async stop(id) {
    const task = this.tasks.get(id);
    this.get(id);
    if (!['queued', 'running', 'stopping'].includes(task.status)) throw new TaskError('invalid_task_state', '该任务当前没有运行。');
    const active = this.active?.id === id && !this.active.messageId;
    task.status = active ? 'stopping' : 'stopped';
    if (active) this.active.controller.abort();
    await this.save(task);
    return this.get(id);
  }

  async artifact(id, name) {
    const task = this.get(id);
    const allowed = new Set(['input.txt', 'result.json', 'checks.json', 'model-response.json', 'runtime-summary.json', ...(task.artifact_names || [])]);
    if (!allowed.has(name) || name.includes('/') || name.includes('\\') || name.includes('..') || !task.attempts.length) throw new TaskError('artifact_not_found', '未找到该产物。', 404);
    try { return await readFile(join(this.directory, 'runs', task.attempts.at(-1).id, name)); }
    catch (error) { if (error.code === 'ENOENT') throw new TaskError('artifact_not_found', '该产物尚未生成。', 404); throw error; }
  }

  async close() {
    this.closing = true;
    this.active?.controller.abort();
    for (const task of this.tasks.values()) {
      let changed = false;
      if (task.status === 'queued') { task.status = 'interrupted'; changed = true; }
      for (const message of task.messages || []) if (message.status === 'queued') { message.status = 'interrupted'; message.error = '回复尚未完成，可以重新发送。'; changed = true; }
      if (changed) await this.save(task);
    }
    while (this.draining) await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
