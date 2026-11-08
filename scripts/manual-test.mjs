// Local manual UI checks: real task service, simulated runners, isolated storage.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { TaskService, TaskError } from '../apps/server/tasks.mjs';
import { createTaskServer } from '../apps/server/main.mjs';
import { projectRoot } from '../apps/server/config.mjs';

const sample = 'A)KDEN E)RWY 17L CLSD';
const records = [{ airport: 'KDEN', runway: '17L', affect_actype: null, affect_region: 'TAKEOFFS,LANDINGS', flight_type: 'International,Domestic,Regional' }];
const reportCases = JSON.parse(await readFile(new URL('../evaluation/report-cases.json', import.meta.url), 'utf8')).cases;

export async function createSimulation({ directory = join(projectRoot, 'var-manual-test'), taskDelay = 30000, replyDelay = 2000, slowDelay = 30000 } = {}) {
  let preparing = true;
  const runner = async ({ notam, parserType, notamId, artifactDir, signal }) => {
    const started = Date.now();
    await delay(preparing ? 10 : taskDelay, undefined, { signal });
    let output;
    if (parserType === 'runway' && notam === sample) output = records;
    else {
      const fixture = parserType === 'report' && reportCases.find(item => item.notam === notam);
      if (!fixture) throw new Error('simulation_sample_not_supported');
      output = { ...fixture.expected, id: notamId || fixture.notam_id };
    }
    const receipt = { raw: JSON.stringify(output), runtime: 'simulation', model: '本地固定样例（无模型调用）', elapsed_ms: Date.now() - started, tool_calls: [], tool_results: [], simulated: true };
    await writeFile(join(artifactDir, 'runtime-summary.json'), JSON.stringify({ ...receipt, raw: undefined }, null, 2));
    return receipt;
  };
  const chatRunner = async ({ conversation, artifactDir, signal }) => {
    const started = Date.now();
    const { content, history } = conversation;
    await delay(content.includes('慢回复') ? slowDelay : replyDelay, undefined, { signal });
    if (content.includes('模拟回复失败')) throw new Error('simulation_reply_failure');
    const previous = history.at(-1)?.user;
    const raw = `【模拟回复 · 不调用模型】\n\n收到：${content}\n\n已收到 ${history.length} 轮已完成的历史对话。${previous ? `上一轮问题：${previous}` : '这是第一轮对话。'}\n\n本回复仅用于检查对话、历史保留与控制操作，不解析报文。`;
    const receipt = { raw, model: '本地模拟回复', elapsed_ms: Date.now() - started, simulated: true };
    await writeFile(join(artifactDir, 'simulation-response.json'), JSON.stringify(receipt, null, 2));
    return receipt;
  };
  const service = await TaskService.open({ directory, runner, chatRunner, executionMode: 'simulation' });
  const save = service.save.bind(service);
  service.save = async task => {
    task.data_origin = 'simulation';
    task.plan = ['读取本地固定测试样例', '等待模拟执行，不调用模型或外部工具', '使用现有字段检查逻辑核对样例', '保存模拟结果与操作记录'];
    return save(task);
  };
  const sendMessage = service.sendMessage.bind(service);
  service.sendMessage = async (id, input) => {
    if (input.content?.includes('模拟发送失败')) throw new TaskError('simulation_send_failure', '模拟：本次发送未接收，请修改内容后重试。', 503);
    return sendMessage(id, input);
  };
  try {
    if (!service.list().length) {
      const chat = await service.create({ notam: sample, notam_id: '模拟-对话检查', timeout_seconds: 300 });
      await service.start(chat.id);
      const deadline = Date.now() + 10000;
      while (['queued', 'running'].includes(service.get(chat.id).status)) {
        if (Date.now() > deadline) throw new Error('模拟样例准备超时。');
        await delay(20);
      }
      if (service.get(chat.id).status !== 'completed') throw new Error('模拟样例未通过字段检查。');
      await service.create({ notam: sample, notam_id: '模拟-停止与继续', timeout_seconds: 300 });
    }
    preparing = false;
    const app = await createTaskServer({ service });
    // Override only the simulation health response; all task routes use the original server.
    const handler = app.server.listeners('request')[0];
    app.server.removeListener('request', handler);
    app.server.on('request', (request, response) => {
      if (request.method === 'GET' && new URL(request.url, 'http://localhost').pathname === '/api/health') {
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ mode: 'simulation', data: { runtime: 'simulation', model_configured: false, model: '本地模拟（不需要 Key）', supported_parsers: ['runway', 'report'] } }));
      } else void handler(request, response);
    });
    return app;
  } catch (error) { await service.close(); throw error; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let app;
  try {
    app = await createSimulation();
    await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(4786, '127.0.0.1', resolve); });
    console.log('SZH 模拟测试：http://127.0.0.1:4786/preview/');
    console.log('不调用模型；记录保存到 var-manual-test。保持窗口打开，Ctrl+C 停止。');
    let closing = false;
    const close = async () => { if (closing) return; closing = true; await app.close(); };
    process.on('SIGINT', close);
    process.on('SIGTERM', close);
  } catch (error) {
    console.error(error.code === 'EADDRINUSE' ? '4786 端口已被占用。若模拟服务已启动，请直接打开上述地址。' : error.message);
    if (app) await app.close();
    process.exitCode = 1;
  }
}
