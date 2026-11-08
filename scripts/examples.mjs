import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const routes = {
  '/api/solutions': '../solutions/aviation-notam/solution.json',
  '/api/examples/task': '../contracts/task.example.json',
  '/api/knowledge/sources': '../knowledge/sources.json',
  '/api/examples/knowledge-hit': '../contracts/knowledge-hit.example.json',
};
const server = createServer(async (request, response) => {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Access-Control-Allow-Origin', '*');
  if (request.method !== 'GET') {
    response.writeHead(405, { Allow: 'GET' });
    response.end(JSON.stringify({ mode: 'fixture', message: '样例入口仅用于读取接口样例，不执行任务。' }));
    return;
  }
  const path = new URL(request.url, 'http://127.0.0.1').pathname;
  if (path === '/api/health') {
    response.end(JSON.stringify({ mode: 'fixture', runtime_connected: false, model_called: false }));
    return;
  }
  if (!routes[path]) {
    response.writeHead(404);
    response.end(JSON.stringify({ mode: 'fixture', message: '没有这个样例接口。' }));
    return;
  }
  try {
    const data = JSON.parse(await readFile(new URL(routes[path], import.meta.url), 'utf8'));
    response.end(JSON.stringify({ mode: 'fixture', data }));
  } catch (error) {
    response.writeHead(500);
    response.end(JSON.stringify({ mode: 'fixture', message: error.message }));
  }
});
server.listen(4780, '127.0.0.1', () => {
  console.log('接口样例：http://127.0.0.1:4780/api/health');
  console.log('当前为客户端开发样例，未连接模型与任务执行。按 Ctrl+C 结束。');
});
