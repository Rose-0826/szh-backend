import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { zstdCompressSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { activityEvent, readArchivedActivity } from '../apps/server/task-activity.mjs';
import { TaskService } from '../apps/server/tasks.mjs';

test('任务过程保留模型分析与文字，不带入系统指令和完整原始流', () => {
  assert.equal(activityEvent({ type: 'system/message', data: { message: 'private instructions' } }), null);
  const message = activityEvent({ type: 'assistant/message', data: { turn: 1, step: 1, stream: [{ raw: true }], message: { role: 'assistant', content: [{ type: 'reasoning', text: '核对原文' }, { type: 'text', text: '准备查询' }, { type: 'tool-call', name: 'separate-event' }] } } });
  assert.deepEqual(message.data.message.content.map((part) => part.type), ['reasoning', 'text']);
  assert.equal(message.data.stream, undefined);
});
test('执行期间可读取分析和工具事件，完成后重开仍保留', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'szh-activity-'));
  let release; const hold = new Promise((resolve) => { release = resolve; });
  let announced; const ready = new Promise((resolve) => { announced = resolve; });
  const service = await TaskService.open({ directory, executionMode: 'test', runner: async ({ onEvent }) => {
    onEvent({ type: 'assistant/message', data: { turn: 1, step: 1, message: { content: [{ type: 'reasoning', text: '核对报文中的机场' }] } } });
    onEvent({ type: 'tool/call', data: { callId: 'test', name: 'notam_schema', arguments: '{}' } });
    announced(); await hold;
    return { raw: JSON.stringify([{ airport: 'KDEN', runway: '17L', affect_actype: 'ALL', affect_region: 'TAKEOFFS,LANDINGS', flight_type: 'International,Domestic,Regional' }]), tool_calls: [], tool_results: [] };
  } });
  t.after(async () => { release(); await service.close(); await rm(directory, { recursive: true, force: true }); });
  const task = await service.create({ notam: 'A)KDEN E)RWY 17L CLSD' });
  await service.start(task.id); await ready;
  assert.equal(service.get(task.id).activity[0].data.message.content[0].text, '核对报文中的机场');
  assert.equal(service.get(task.id).activity[1].data.name, 'notam_schema');
  release(); await service.close();
  const reopened = await TaskService.open({ directory });
  assert.equal(reopened.get(task.id).activity.length, 2);
  await reopened.close();
});

test('只读加载历史DSH分析记录，原始压缩日志保持不变', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'szh-archive-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sessionPath = join(directory, 'dsh', 'sessions', 'workspace', 'session-test');
  await mkdir(sessionPath, { recursive: true });
  const file = join(sessionPath, 'session.v4.jsonl.zstd');
  const original = zstdCompressSync(Buffer.from([
    { type: 'session', version: 4 },
    { type: 'system/message', data: { message: 'not part of the UI transcript' } },
    { type: 'assistant/message', data: { turn: 1, step: 1, message: { content: [{ type: 'reasoning', text: '真实历史分析' }] } } },
  ].map((event) => JSON.stringify(event)).join('\n') + '\n'));
  await writeFile(file, original);
  const activity = await readArchivedActivity(directory, 'session-test');
  assert.equal(activity.length, 1);
  assert.equal(activity[0].data.message.content[0].text, '真实历史分析');
  assert.deepEqual(await readFile(file), original);
  assert.deepEqual(await readArchivedActivity(directory, 'missing-session'), []);
});
