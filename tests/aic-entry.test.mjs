import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskService } from '../apps/server/tasks.mjs';
import { createTaskServer } from '../apps/server/main.mjs';
import { resolveAicMaterials } from '../apps/server/aic-entry.mjs';

const archiveSkip = await resolveAicMaterials().then(() => false, (error) => {
  if (process.env.SZH_AIC_MATERIALS || error.code !== 'aic_materials_missing') throw error;
  return 'Optional AIC archive fixtures are not included in the backend checkout.';
});
const archiveTest = (name, run) => test(name, { skip: archiveSkip }, run);

const ellipse = 'ellipse_a1p4_Re169.08_cy-0.368_D1.171';
const rectangle = 'rectangle_a1p7_Re133.03_cy0.304_D1.131';
const notam = 'A)KDEN E) DEN RWY 17L/35R CLSD';
const rows = ['17L', '35R'].map((runway) => ({ airport: 'KDEN', runway, affect_actype: null, affect_region: 'TAKEOFFS,LANDINGS', flight_type: 'International,Domestic,Regional' }));

async function until(service, id, accepted) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const task = service.get(id);
    if (accepted.includes(task.status)) return task;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error(`等待状态超时：${service.get(id).status}`);
}

async function setup(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'szh-aic-'));
  const service = await TaskService.open({ directory, executionMode: 'test', runner: options.runner || (async () => { throw new Error('notam_runner_called'); }), chatRunner: options.chatRunner, aicGate: options.aicGate });
  t.after(async () => { await service.close(); await rm(directory, { recursive: true, force: true }); });
  return { service, directory };
}

archiveTest('创建AIC任务不调用模型，确认后返回历史基线、候选、指标和未记录耗时', async (t) => {
  let calls = 0;
  const { service } = await setup(t, { runner: async () => { calls += 1; throw new Error('notam_runner_called'); } });
  const created = await service.create({ solution_id: 'aic-flowproxy' });
  assert.equal(created.status, 'awaiting_confirmation');
  assert.equal(calls, 0);
  assert.deepEqual(created.case_ids, [ellipse, rectangle]);
  await service.start(created.id);
  const done = await until(service, created.id, ['completed']);
  assert.equal(calls, 0);
  assert.equal(done.model_called, false);
  assert.equal(done.data_origin, 'historical_catalog');
  assert.equal(done.result.record_type, 'historical_result');
  assert.equal(done.result.protocol.future_observation_count, 76);
  assert.equal(done.result.summary_40s.parent.passed_internal_target, 7);
  assert.equal(done.result.summary_40s.selected.passed_internal_target, 12);
  assert.equal(done.result.current_week_trials.length, 0);
  const shown = done.result.cases.find((item) => item.case_id === ellipse);
  const selected = shown.comparison.find((item) => item.version_id === 'selected');
  const parent = shown.comparison.find((item) => item.version_id === 'parent');
  assert.equal(selected.meets_internal_target, true);
  assert.equal(parent.meets_internal_target, false);
  assert.equal(selected.duration_seconds, null);
  assert.equal(selected.duration_status, '未记录');
  assert.equal(selected.relative_l2_mean_percent.Uy, 2.6377);
  assert.equal(done.result.candidates.filter((item) => item.role === 'baseline').length, 1);
  assert.equal(done.result.candidates.filter((item) => item.metrics === null).length, 3);
  const chosen = done.result.candidates.find((item) => item.trial_id === 'coverage_rollout32_step1500');
  assert.equal(chosen.selected, true);
  assert.equal(chosen.metrics.passed_internal_target, 12);
  assert.equal(done.result.timing.applies_to_display_cases, false);
  assert.equal(done.result.timing.rows.some((item) => item.case_id === ellipse), false);
  assert.equal(done.result.batch_metrics.length, 12);
  assert.equal(done.steps.at(-1).id, 'pending');
  const figure = await service.artifact(done.id, '代表椭圆_Uy参考重建误差.png');
  assert.equal(figure.subarray(0, 4).toString('hex'), '89504e47');
  const metrics = JSON.parse(await service.artifact(done.id, 'metrics.json'));
  assert.equal(metrics.batch_metrics.length, 12);
});

archiveTest('未知工况被拒绝，排队中的AIC任务可停止，继续和重开后结果仍在', async (t) => {
  let release;
  const hold = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const { service, directory } = await setup(t, { runner: async () => { calls += 1; await hold; return { raw: JSON.stringify(rows), runtime: 'test', tool_calls: [], tool_results: [] }; } });
  await assert.rejects(service.create({ solution_id: 'aic-flowproxy', case_ids: ['missing-case'] }), { code: 'unknown_case' });
  const first = await service.create({ notam });
  const second = await service.create({ solution_id: 'aic-flowproxy', case_ids: [rectangle, rectangle] });
  assert.deepEqual(second.case_ids, [rectangle]);
  await service.start(first.id);
  await until(service, first.id, ['running']);
  await service.start(second.id);
  assert.equal(service.get(second.id).status, 'queued');
  await service.stop(second.id);
  release();
  await until(service, first.id, ['completed']);
  assert.equal(service.get(second.id).status, 'stopped');
  assert.equal(calls, 1);
  await service.start(second.id, true);
  const done = await until(service, second.id, ['completed']);
  assert.equal(done.result.cases.length, 1);
  assert.equal(done.result.cases[0].case_id, rectangle);
  assert.equal(done.result.cases[0].comparison.find((item) => item.version_id === 'parent').meets_internal_target, false);
  await service.close();
  const reopened = await TaskService.open({ directory, executionMode: 'test', runner: async () => { throw new Error('notam_runner_called'); } });
  t.after(() => reopened.close());
  const again = reopened.get(done.id);
  assert.equal(again.status, 'completed');
  assert.equal(again.result.selected_trial_id, 'coverage_rollout32_step1500');
  const downloaded = await reopened.artifact(done.id, '同批12例_40秒对照.csv');
  assert.match(downloaded.toString('utf8'), new RegExp(rectangle));
});

archiveTest('运行中停止AIC入口不会留下成功结果，HTTP可下载文件', async (t) => {
  let block = true;
  let entered;
  const enteredPromise = new Promise((resolve) => { entered = resolve; });
  const { service } = await setup(t, {
    aicGate: (signal) => new Promise((resolve, reject) => {
      if (!block) return resolve();
      entered();
      if (signal.aborted) return reject(new Error('run_stopped'));
      signal.addEventListener('abort', () => reject(new Error('run_stopped')), { once: true });
    }),
  });
  const task = await service.create({ solution_id: 'aic-flowproxy', case_ids: [ellipse] });
  await service.start(task.id);
  await enteredPromise;
  await service.stop(task.id);
  const stopped = await until(service, task.id, ['stopped']);
  assert.equal(stopped.result, null);
  assert.equal(stopped.runtime_executed, false);
  block = false;
  const app = await createTaskServer({ service });
  app.server.listen(0, '127.0.0.1');
  await new Promise((resolve) => app.server.once('listening', resolve));
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const entry = await fetch(base + '/?team=1', { redirect: 'manual' });
  assert.equal(entry.status, 302);
  assert.equal(entry.headers.get('location'), '/preview/?team=1');
  assert.equal((await fetch(base + '/index.html')).status, 200);
  const health = await (await fetch(base + '/api/health')).json();
  assert.deepEqual(health.data.supported_parsers, ['runway', 'report']);
  assert.deepEqual(health.data.supported_solutions, ['aviation-notam', 'aic-flowproxy']);
  const solutions = await (await fetch(base + '/api/solutions')).json();
  assert.equal(solutions.data.some((item) => item.id === 'aic-flowproxy'), true);
  await service.start(task.id, true);
  const done = await until(service, task.id, ['completed']);
  const response = await fetch(`${base}/api/tasks/${done.id}/artifacts/result.json`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  const body = await response.json();
  assert.equal(body.record_type, 'historical_result');
  assert.equal(body.model_called, false);
});

archiveTest('AIC任务上的消息不覆盖成果，停止回复后可以再发送', async (t) => {
  let calls = 0;
  let entered;
  const enteredPromise = new Promise((resolve) => { entered = resolve; });
  const { service } = await setup(t, {
    chatRunner: async ({ signal }) => {
      calls += 1;
      if (calls === 1) {
        entered();
        if (signal?.aborted) throw new Error('run_stopped');
        await new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('run_stopped')), { once: true }));
      }
      return { raw: '正式版的 Uy 和 p 相对 L2 低于父版，平均 R 也更低。', activity: [] };
    },
  });
  if (typeof service.sendMessage !== 'function') return;
  const task = await service.create({ solution_id: 'aic-flowproxy', case_ids: [ellipse] });
  await service.start(task.id);
  const done = await until(service, task.id, ['completed']);
  const before = JSON.stringify(done.result.summary_40s);
  const waitMessage = async (status) => {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      const current = service.get(done.id);
      if (current.messages?.at(-1)?.status === status) return current;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`回复没有进入 ${status}`);
  };
  await service.sendMessage(done.id, { content: '哪个指标改善了' });
  await enteredPromise;
  await service.stopMessage(done.id);
  const stopped = await waitMessage('stopped');
  assert.equal(stopped.status, 'completed');
  assert.equal(JSON.stringify(stopped.result.summary_40s), before);
  await service.sendMessage(done.id, { content: '请直接说改善了哪些指标' });
  const answered = await waitMessage('completed');
  assert.match(answered.messages.at(-1).reply, /Uy/);
  assert.equal(answered.attempts.length, done.attempts.length);
  assert.equal(JSON.stringify(answered.result.summary_40s), before);
});
