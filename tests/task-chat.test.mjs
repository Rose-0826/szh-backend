import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskService } from '../apps/server/tasks.mjs';
import { createTaskServer } from '../apps/server/main.mjs';

const notam = 'A)KDEN E)RWY 17L CLSD';
const result = [{ airport: 'KDEN', runway: '17L', affect_actype: null, affect_region: 'TAKEOFFS,LANDINGS', flight_type: 'International,Domestic,Regional' }];
const receipt = () => ({ raw: JSON.stringify(result), runtime: 'test', tool_calls: [], tool_results: [] });
async function until(service, id, predicate) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) { const task = service.get(id); if (predicate(task)) return task; await new Promise((resolve) => setTimeout(resolve, 5)); }
  throw new Error('Task did not reach the expected state');
}
async function setup(t, chatRunner, runner = async () => receipt()) {
  const directory = await mkdtemp(join(tmpdir(), 'szh-chat-'));
  const service = await TaskService.open({ directory, chatRunner, runner, executionMode: 'test' });
  const app = await createTaskServer({ service });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  return { service, directory, base: `http://127.0.0.1:${app.server.address().port}` };
}
async function completedTask(service) {
  const task = await service.create({ notam });
  await service.start(task.id);
  return until(service, task.id, (value) => value.status === 'completed');
}

test('任务消息接口保留上下文与多轮历史，回复不覆盖原成果，重开后仍可读取', async (t) => {
  const contexts = [];
  const { service, directory, base } = await setup(t, async (options) => { contexts.push(structuredClone(options.conversation)); return { raw: `第${contexts.length}次测试回复`, activity: [] }; });
  const original = await completedTask(service);
  const originalFile = await service.artifact(original.id, 'result.json');
  const response = await fetch(`${base}/api/tasks/${original.id}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: '解释这条限制' }) });
  assert.equal(response.status, 202);
  await until(service, original.id, (value) => value.messages?.at(-1)?.status === 'completed');
  await service.sendMessage(original.id, { content: '再简短一些' });
  const finished = await until(service, original.id, (value) => value.messages?.length === 2 && value.messages.at(-1).status === 'completed');
  assert.deepEqual(contexts[0].result, original.result);
  assert.deepEqual(contexts[1].history, [{ user: '解释这条限制', assistant: '第1次测试回复' }]);
  assert.equal(finished.status, 'completed');
  assert.deepEqual(finished.result, original.result);
  assert.deepEqual(await service.artifact(original.id, 'result.json'), originalFile);
  assert.equal(finished.attempts.length, original.attempts.length);
  const reopened = await TaskService.open({ directory });
  assert.equal(reopened.get(original.id).messages[1].reply, '第2次测试回复');
  await reopened.close();
});

test('解析期间的提问排队，可单独取消而不停止正在执行的任务', async (t) => {
  let release; const hold = new Promise((resolve) => { release = resolve; });
  let chatCalls = 0;
  const { service } = await setup(t, async () => { chatCalls++; return { raw: '回复' }; }, async () => { await hold; return receipt(); });
  t.after(() => release());
  const task = await service.create({ notam }); await service.start(task.id);
  await until(service, task.id, (value) => value.status === 'running');
  await service.sendMessage(task.id, { content: '补充说明' });
  assert.equal(service.get(task.id).messages[0].status, 'queued');
  await service.stopMessage(task.id);
  assert.equal(service.get(task.id).status, 'running');
  release();
  const finished = await until(service, task.id, (value) => value.status === 'completed');
  assert.equal(finished.messages[0].status, 'stopped');
  assert.equal(chatCalls, 0);
});

test('停止生成回复保留已完成成果，之后可继续发送消息', async (t) => {
  let calls = 0;
  const { service } = await setup(t, async ({ signal }) => {
    calls++;
    if (signal.aborted) throw new Error('run_stopped');
    if (calls === 1) await new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('run_stopped')), { once: true }));
    return { raw: '继续回答成功' };
  });
  const task = await completedTask(service);
  await service.sendMessage(task.id, { content: '说明依据' });
  await until(service, task.id, (value) => value.messages?.at(-1)?.status === 'running');
  await service.stopMessage(task.id);
  await until(service, task.id, (value) => value.messages?.at(-1)?.status === 'stopped');
  assert.equal(service.get(task.id).status, 'completed');
  assert.deepEqual(service.get(task.id).result, task.result);
  await service.sendMessage(task.id, { content: '继续' });
  const finished = await until(service, task.id, (value) => value.messages?.at(-1)?.status === 'completed');
  assert.equal(finished.messages.at(-1).reply, '继续回答成功');
});

test('空消息与重复发送正确返回错误，模型失败保留用户消息和原任务', async (t) => {
  let release; const hold = new Promise((resolve) => { release = resolve; });
  const { service, base } = await setup(t, async () => { await hold; throw new Error('model_quota_exhausted'); });
  t.after(() => release());
  const task = await completedTask(service);
  const empty = await fetch(`${base}/api/tasks/${task.id}/messages`, { method: 'POST', body: JSON.stringify({ content: ' ' }) });
  assert.equal(empty.status, 422);
  await service.sendMessage(task.id, { content: '我的问题' });
  await assert.rejects(service.sendMessage(task.id, { content: '重复点击' }), { code: 'reply_in_progress' });
  release();
  const failed = await until(service, task.id, (value) => value.messages?.at(-1)?.status === 'failed');
  assert.equal(failed.messages[0].content, '我的问题');
  assert.match(failed.messages[0].error, /余额/);
  assert.equal(failed.status, 'completed');
});
