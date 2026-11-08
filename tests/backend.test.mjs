import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { once } from 'node:events';
import { request } from 'node:http';
import { TaskService } from '../apps/server/tasks.mjs';
import { checkParsing } from '../apps/server/parsing.mjs';
import { createTaskServer } from '../apps/server/main.mjs';
import { tmpdir } from 'node:os';

const notam = 'A)KDEN E) DEN RWY 17L/35R CLSD';
const rows = ['17L', '35R'].map((runway) => ({ airport: 'KDEN', runway, affect_actype: null, affect_region: 'TAKEOFFS,LANDINGS', flight_type: 'International,Domestic,Regional' }));
const receipt = () => ({ raw: JSON.stringify(rows), runtime: 'test-adapter', session_id: 'test-only', model: 'test-only', elapsed_ms: 1, tool_calls: [] });

async function setup(t, runner = async () => receipt()) {
  const parent = tmpdir();
  const directory = await mkdtemp(join(parent, 'szh-backend-test-'));
  const service = await TaskService.open({ directory, runner, executionMode: 'test' });
  t.after(async () => {
    await service.close();
    assert.equal(dirname(directory), parent);
    assert(basename(directory).startsWith('szh-backend-test-'));
    await rm(directory, { recursive: true });
  });
  return { service, directory };
}

async function until(service, id, accepted) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const task = service.get(id);
    if (accepted.includes(task.status)) return task;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`等待状态超时：${service.get(id).status}`);
}

test('接受论文附录字段草案及完整JSON代码围栏', () => {
  assert.equal(checkParsing(JSON.stringify(rows), notam).valid, true);
  assert.equal(checkParsing('```json\n' + JSON.stringify(rows) + '\n```', notam).valid, true);
});

test('拒绝截断JSON、缺字段、错误类型、未知枚举、额外字段与空结果', () => {
  const invalid = [
    '[{"airport":',
    JSON.stringify([{ airport: 'KDEN' }]),
    JSON.stringify([{ ...rows[0], affect_actype: 5 }]),
    JSON.stringify([{ ...rows[0], affect_region: 'UNKNOWN' }]),
    JSON.stringify([{ ...rows[0], extra: true }]),
    '[]',
  ];
  for (const value of invalid) assert.equal(checkParsing(value, notam).valid, false);
});

test('识别与原文机场不一致及重复方向记录', () => {
  assert.match(checkParsing(JSON.stringify([{ ...rows[0], airport: 'ZBAA' }]), notam).errors[0], /不一致/);
  assert.match(checkParsing(JSON.stringify([rows[0], rows[0]]), notam).errors[0], /重复/);
});

test('不接受虚构或漏掉的跑道方向，局部范围保留待确认提示', () => {
  assert.equal(checkParsing(JSON.stringify([rows[0]]), notam).valid, false);
  assert.equal(checkParsing(JSON.stringify([{ ...rows[0], runway: '16L' }, rows[1]]), notam).valid, false);
  const partial = checkParsing(JSON.stringify(rows), 'A)KDEN E) RWY 17L/35R E 500FT CLSD');
  assert.equal(partial.valid, true);
  assert(partial.warnings.some((warning) => warning.includes('局部范围')));
  assert.equal(partial.evidence.runways[0].text, 'RWY 17L/35R');
});

test('没有明确跑道时不接受模型补猜，空结果准确说明缺项', () => {
  for (const text of ['A)KDEN E)AD CLSD', 'A)KDEN E)TWY B CLSD']) {
    assert.equal(checkParsing(JSON.stringify(rows), text).valid, false);
    assert.match(checkParsing('[]', text).errors[0], /不能补猜/);
  }
});

test('区分缺少跑道编号和范围外滑行道，混合报文仍检查明确跑道', () => {
  assert.match(checkParsing('[]', 'A)KDEN E)AD CLSD').errors[0], /未提供.*明确跑道编号/);
  assert.match(checkParsing('[]', 'A)KDEN E)TWY B CLSD').errors[0], /当前仅支持跑道解析/);
  assert.match(checkParsing(JSON.stringify(rows), 'A)KDEN E)TWY B CLSD').errors[0], /当前仅支持跑道解析/);
  assert.doesNotMatch(checkParsing('[]', 'A)KDEN E)RWY CLSD AND TWY B CLSD').errors[0], /当前仅支持跑道解析/);
  assert.equal(checkParsing(JSON.stringify(rows), 'A)KDEN E)RWY 17L/35R CLSD AND TWY B CLSD').valid, true);
});

test('创建不调用模型，确认后运行，已完成任务不能重复启动', async (t) => {
  let calls = 0;
  const { service } = await setup(t, async () => { calls++; return receipt(); });
  const task = await service.create({ notam });
  assert.equal(task.status, 'awaiting_confirmation');
  assert.equal(calls, 0);
  await service.start(task.id);
  await assert.rejects(service.start(task.id), { code: 'invalid_task_state' });
  const completed = await until(service, task.id, ['completed']);
  assert.equal(calls, 1);
  assert.equal(completed.execution_mode, 'test');
  assert.equal(completed.professional_review, 'pending');
  assert.deepEqual(JSON.parse(await service.artifact(task.id, 'result.json')), rows);
  await assert.rejects(service.start(task.id, true), { code: 'invalid_task_state' });
});

test('单任务排队，排队中的任务可停止且不调用模型', async (t) => {
  let release;
  let calls = 0;
  const hold = new Promise((resolve) => { release = resolve; });
  const { service } = await setup(t, async () => { calls++; await hold; return receipt(); });
  const first = await service.create({ notam });
  const second = await service.create({ notam });
  await service.start(first.id);
  await until(service, first.id, ['running']);
  await service.start(second.id);
  assert.equal(service.get(second.id).status, 'queued');
  await service.stop(second.id);
  release();
  await until(service, first.id, ['completed']);
  assert.equal(service.get(second.id).status, 'stopped');
  assert.equal(calls, 1);
});

test('运行中停止保留记录，继续时可以重新执行未完成调用', async (t) => {
  let calls = 0;
  const { service } = await setup(t, async ({ signal }) => {
    calls++;
    if (calls === 1) await new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('run_stopped')), { once: true }));
    return receipt();
  });
  const task = await service.create({ notam });
  await service.start(task.id);
  while (!calls) await new Promise((resolve) => setTimeout(resolve, 5));
  await service.stop(task.id);
  await until(service, task.id, ['stopped']);
  await service.start(task.id, true);
  const completed = await until(service, task.id, ['completed']);
  assert.equal(calls, 2);
  assert.equal(completed.attempts.length, 2);
});

test('余额不足和超时分别记录为失败，不产生成功结果', async (t) => {
  for (const code of ['model_quota_exhausted', 'model_timeout']) {
    const { service } = await setup(t, async () => { throw new Error(code); });
    const task = await service.create({ notam });
    await service.start(task.id);
    const failed = await until(service, task.id, ['failed']);
    assert.equal(failed.error.code, code);
    assert.equal(failed.runtime_executed, false);
    assert.equal(failed.result, null);
  }
});

test('模型返回非JSON时标记invalid_output', async (t) => {
  const { service } = await setup(t, async () => ({ ...receipt(), raw: '解析失败' }));
  const task = await service.create({ notam });
  await service.start(task.id);
  const invalid = await until(service, task.id, ['invalid_output']);
  assert.equal(invalid.checks.valid, false);
  assert.equal(invalid.result, null);
});

test('服务重启后保留已完成结果，并恢复未完成任务的模型检查点', async (t) => {
  const { service, directory } = await setup(t);
  const completed = await service.create({ notam });
  await service.start(completed.id);
  await until(service, completed.id, ['completed']);
  const interrupted = await service.create({ notam });
  const saved = service.tasks.get(interrupted.id);
  saved.status = 'running';
  saved.attempts = [{ id: 'test-checkpoint', status: 'running' }];
  const runDir = join(directory, 'runs/test-checkpoint');
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, 'model-response.json'), JSON.stringify(receipt()));
  await service.save(saved);
  await service.close();
  let calls = 0;
  const restarted = await TaskService.open({ directory, runner: async () => { calls++; return receipt(); }, executionMode: 'test' });
  t.after(() => restarted.close());
  assert.equal(restarted.get(completed.id).status, 'completed');
  assert.equal(restarted.get(interrupted.id).status, 'interrupted');
  await restarted.start(interrupted.id, true);
  await until(restarted, interrupted.id, ['completed']);
  assert.equal(calls, 0);
});

test('HTTP接口可以创建、启动、查询与下载；错误输入及未提供产物正确报错', async (t) => {
  const { service } = await setup(t);
  const app = await createTaskServer({ service });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await fetch(base + '/api/health')).status, 200);
  const html = await fetch(base + '/index.html');
  assert.match(html.headers.get('content-type'), /text\/html/);
  assert.match(await html.text(), /task-client.js/);
  assert.equal((await fetch(base + '/SZH_assets/task-client.js')).status, 200);
  assert.equal((await fetch(base + '/.env')).status, 404);
  const hits = (await (await fetch(base + '/api/knowledge/search?q=QMRLC')).json()).data;
  assert(hits.some((hit) => hit.id === 'faa-qmrlc' && hit.locator && hit.url));
  const missing = (await (await fetch(base + '/api/knowledge/search?q=unlisted-facility-code')).json()).data;
  assert.deepEqual(missing, []);
  assert.equal((await fetch(base + '/api/knowledge/faa-qmrlc')).status, 200);
  assert.equal((await fetch(base + '/api/knowledge/nonexistent')).status, 404);
  assert.equal((await post('/api/tasks', { notam: '' })).status, 422);
  assert.equal((await post('/api/tasks', { notam, parser_type: 'light' })).status, 422);
  const created = await post('/api/tasks', { notam });
  assert.equal(created.status, 201);
  const id = (await created.json()).data.id;
  assert.equal((await post(`/api/tasks/${id}/start`, {})).status, 202);
  await until(service, id, ['completed']);
  const queried = await (await fetch(base + `/api/tasks/${id}`)).json();
  assert.equal(queried.data.status, 'completed');
  assert.deepEqual(await (await fetch(base + `/api/tasks/${id}/artifacts/result.json`)).json(), rows);
  assert.equal((await fetch(base + `/api/tasks/${id}/artifacts/runtime.patch.yml`)).status, 404);
  assert.equal((await post(`/api/tasks/${id}/start`, {})).status, 409);
});

test('分块传入中文报文时保留完整字符', async (t) => {
  const { service } = await setup(t);
  const app = await createTaskServer({ service });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  t.after(() => app.close());
  const text = 'A)ZBLA E)机场关闭，因跑道积冰。';
  const body = Buffer.from(JSON.stringify({ notam: text }));
  const split = body.indexOf(Buffer.from('场')) + 1;
  const result = await new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: app.server.address().port, path: '/api/tasks', method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
    });
    req.on('error', reject);
    req.write(body.subarray(0, split));
    setTimeout(() => req.end(body.subarray(split)), 10);
  });
  assert.equal(result.status, 201);
  assert.equal(result.body.data.notam, text);
});
