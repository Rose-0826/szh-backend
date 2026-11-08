import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { TaskService, TaskError } from './tasks.mjs';
import { SolutionRegistry, ProtocolError, validateInput } from './solution-registry.mjs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RunService, aicExecutor } from './solution-runs.mjs';
import { loadModelConfig } from './config.mjs';
import { searchKnowledge, readKnowledge } from './knowledge.mjs';

const webRoot = new URL('../client/web/', import.meta.url);
const webFiles = new Map([
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/preview', ['../workbench/dist/index.html', 'text/html; charset=utf-8']],
  ['/preview/', ['../workbench/dist/index.html', 'text/html; charset=utf-8']],
  ['/preview/assets/workbench.js', ['../workbench/dist/assets/workbench.js', 'text/javascript; charset=utf-8']],
  ['/preview/assets/workbench.css', ['../workbench/dist/assets/workbench.css', 'text/css; charset=utf-8']],
  ...['workbench.css', 'task-client.css', 'task-client.js'].map((name) => [`/SZH_assets/${name}`, [`SZH_assets/${name}`, name.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8']]),
  ['/SZH_assets/fonts/NotoSansSC.ttf', ['SZH_assets/fonts/NotoSansSC.ttf', 'font/ttf']],
]);

// Only the published sample files are accessible through the preview service.
const sampleFiles = JSON.parse(await readFile(new URL('../client/workbench/src/aic-files.json', import.meta.url), 'utf8'));
const sampleTypes = { png:'image/png', md:'text/plain; charset=utf-8', json:'application/json; charset=utf-8', csv:'text/csv; charset=utf-8' };
for (const name of sampleFiles) {
  const resource = name.split('/').map(encodeURIComponent).join('/');
  webFiles.set('/preview/aic/' + resource, ['../workbench/dist/aic/' + resource, sampleTypes[name.split('.').pop()] || 'application/octet-stream']);
}

const reviewFiles = [
  ['solution', 'AIC_流相方案说明.md'],
  ['metrics', 'AIC_结果指标与字段说明.md'],
  ['sources', 'AIC_资料出处与产物索引.md'],
  ['checklist', 'AIC_最终产物核对清单.md'],
];
for (const [key, name] of reviewFiles) {
  webFiles.set('/preview/aic-review/' + key, ['../../../资料与评测/' + encodeURIComponent(name), 'text/plain; charset=utf-8']);
}

const notamSolution = JSON.parse(await readFile(new URL('../../solutions/aviation-notam/solution.json', import.meta.url), 'utf8'));
const aicSolution = JSON.parse(await readFile(new URL('../../solutions/aic-flowproxy/solution.json', import.meta.url), 'utf8'));
const solutions = [notamSolution, aicSolution];

function artifactType(name) {
  if (name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.log')) return 'text/plain; charset=utf-8';
  if (name.endsWith('.csv')) return 'text/csv; charset=utf-8';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.npz')) return 'application/octet-stream';
  return 'application/json; charset=utf-8';
}

async function readJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    chunks.push(chunk); bytes += chunk.length;
    if (bytes > 100000) throw new TaskError('request_too_large', '请求内容过长。', 413);
  }
  let input;
  try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new TaskError('invalid_json', '请求正文必须为JSON。', 400); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TaskError('invalid_json', '请求正文必须为JSON对象。', 400);
  return input;
}

export async function createTaskServer(options = {}) {
  const service = options.service || await TaskService.open();
  const registry = options.registry || new SolutionRegistry(join(service.directory, 'solution-versions'));
  const execute = options.executeSolution || (process.env.SZH_AIC_PYTHON && process.env.SZH_AIC_PACKAGE ? aicExecutor({ python: process.env.SZH_AIC_PYTHON, packageRoot: process.env.SZH_AIC_PACKAGE, script: fileURLToPath(new URL('../../scripts/aic/run_solution.py', import.meta.url)) }) : null);
  const runs = await RunService.open(join(service.directory, 'solution-runs'), registry, execute);
  const server = createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    const send = (status, data) => { response.writeHead(status); response.end(JSON.stringify({ mode: 'development', data })); };
    try {
      if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
      const url = new URL(request.url, 'http://127.0.0.1');
      const path = url.pathname;
      if ((request.method === 'GET' || request.method === 'HEAD') && path === '/') {
        response.writeHead(302, { Location: '/preview/' + url.search, 'Cache-Control': 'no-store' });
        response.end();
        return;
      }
      if (request.method === 'GET' && webFiles.has(path)) {
        const [file, type] = webFiles.get(path);
        response.setHeader('Content-Type', type);
        response.writeHead(200); response.end(await readFile(new URL(file, webRoot))); return;
      }
      if (request.method === 'GET' && path === '/api/health') {
        let config;
        try { config = loadModelConfig(); } catch {}
        send(200, { runtime: 'dsh', model_configured: Boolean(config), model: config?.model, reasoning_effort: config?.reasoningEffort, model_availability: 'not_probed', supported_parsers: notamSolution.parser_types, supported_solutions: solutions.map((item) => item.id), schema_status: notamSolution.schema_status });
        return;
      }
      if (path === '/api/v1/runs') {
        if (request.method === 'GET') { send(200, runs.list()); return; }
        if (request.method === 'POST') { send(202, await runs.create(await readJson(request))); return; }
      }
      const runRoute = path.match(/^\/api\/v1\/runs\/([a-f0-9-]+)(?:\/(cancel|artifacts)(?:\/([a-f0-9-]+)\/download)?)?$/);
      if (runRoute) {
        const [, id, action, artifactId] = runRoute;
        if (request.method === 'GET' && !action) { send(200, runs.get(id)); return; }
        if (request.method === 'POST' && action === 'cancel') { send(202, await runs.cancel(id)); return; }
        if (request.method === 'GET' && action === 'artifacts') {
          if (!artifactId) { send(200, runs.get(id).artifacts); return; }
          const { artifact, bytes } = await runs.artifact(id, artifactId);
          response.setHeader('Content-Type', artifactType(artifact.name));
          response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(artifact.name)}`);
          response.writeHead(200); response.end(bytes); return;
        }
      }
      if (path === '/api/v1/solutions' && request.method === 'GET') {
        send(200, await registry.list()); return;
      }
      if (path === '/api/v1/solutions/import' && request.method === 'POST') {
        throw new TaskError('maintainer_cli_required', '请由维护者使用方案导入命令发布版本。', 403);
      }
      const versionRoute = path.match(/^\/api\/v1\/solutions\/([a-z][a-z0-9-]*)\/versions(?:\/([0-9]+\.[0-9]+\.[0-9]+)(?:\/(validate-input))?)?$/);
      if (versionRoute) {
        const [, solutionId, version, action] = versionRoute;
        if (request.method === 'GET') {
          send(200, version ? await registry.get(solutionId, version) : (await registry.list()).filter(item => item.manifest.id === solutionId)); return;
        }
        if (request.method === 'POST' && action === 'validate-input') {
          const record = await registry.get(solutionId, version);
          send(200, { valid: true, input: validateInput(record.manifest, await readJson(request)) }); return;
        }
      }
      if (request.method === 'GET' && path === '/api/solutions') { send(200, solutions); return; }
      if (request.method === 'GET' && path === '/api/knowledge/search') { send(200, searchKnowledge(url.searchParams.get('q') || '')); return; }
      if (request.method === 'GET' && path.startsWith('/api/knowledge/')) {
        const hit = readKnowledge(path.slice('/api/knowledge/'.length));
        if (!hit) throw new TaskError('source_not_found', '未找到已收录资料。', 404);
        send(200, hit); return;
      }
      if (path === '/api/tasks' && request.method === 'GET') { send(200, service.list()); return; }
      if (path === '/api/tasks' && request.method === 'POST') {
        send(201, await service.create(await readJson(request)));
        return;
      }
      const match = path.match(/^\/api\/tasks\/([a-f0-9-]+)(?:\/(start|stop|resume|activity|messages|messages\/stop|artifacts\/[^/]+))?$/);
      if (match) {
        const [, id, action] = match;
        if (request.method === 'GET' && !action) { send(200, service.get(id)); return; }
        if (request.method === 'GET' && action === 'activity') { send(200, await service.activity(id)); return; }
        if (request.method === 'POST' && action === 'messages') { send(202, await service.sendMessage(id, await readJson(request))); return; }
        if (request.method === 'POST' && action === 'messages/stop') { send(202, await service.stopMessage(id)); return; }
        if (request.method === 'POST' && action === 'start') { send(202, await service.start(id)); return; }
        if (request.method === 'POST' && action === 'resume') { send(202, await service.start(id, true)); return; }
        if (request.method === 'POST' && action === 'stop') { send(202, await service.stop(id)); return; }
        if (request.method === 'GET' && action?.startsWith('artifacts/')) {
          let decodedName;
          try { decodedName = decodeURIComponent(action.slice(10)); }
          catch { throw new TaskError('invalid_artifact', '文件名无效。', 400); }
          const bytes = await service.artifact(id, decodedName);
          const encoded = encodeURIComponent(decodedName);
          response.setHeader('Content-Type', artifactType(decodedName));
          response.setHeader('Content-Disposition', `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`);
          response.writeHead(200); response.end(bytes); return;
        }
      }
      send(404, { code: 'not_found', message: '未找到该接口。' });
    } catch (error) {
      send(error instanceof ProtocolError ? (['version_not_found', 'run_not_found', 'artifact_not_found'].includes(error.code) ? 404 : 400) : error instanceof TaskError ? error.status : 500, { code: error.code || 'internal_error', message: error instanceof TaskError || error instanceof ProtocolError ? error.message : '服务执行失败。' });
    }
  });
  return { server, service, async close() { await service.close(); await new Promise((resolve) => server.close(resolve)); } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = await createTaskServer();
  const port = Number(process.env.SZH_PORT || 4782);
  app.server.listen(port, '127.0.0.1', () => console.log(`SZH任务服务：http://127.0.0.1:${port}/api/health`));
  let closing = false;
  const close = async () => { if (closing) return; closing = true; await app.close(); };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}
