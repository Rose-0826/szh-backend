// Review captures: runs the built Electron client and saves one PNG per route (see SZH_CAPTURE in electron/main.ts).
//
//   node scripts/capture.mjs [--data harness|mock] [--out dir] [--harness http://127.0.0.1:4782]
//                            [--routes "/=home,/solutions=explorer"] [--delay 1800]
//
// In harness mode the default route list is resolved from the live Harness, so Run Console and
// Artifact Viewer captures show real records. Mock records live only inside the renderer, so mock
// mode captures list and workspace pages only.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, i, all) => (arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs), []));
const data = args.data === 'mock' ? 'mock' : 'harness';
const harness = (args.harness || process.env.SZH_HARNESS_URL || 'http://127.0.0.1:4782').replace(/\/$/, '');
const out = resolve(args.out || join(root, 'captures', data));

for (const file of ['dist/index.html', 'dist-electron/main.js']) {
  if (!existsSync(join(root, file))) { console.error(`缺少 ${file}，请先运行 npm run build。`); process.exit(1); }
}

async function harnessRoutes() {
  const get = async (path) => {
    const response = await fetch(harness + path);
    if (!response.ok) throw new Error(`${path} → HTTP ${response.status}`);
    return (await response.json()).data;
  };
  const routes = ['/=01-home', '/solutions=02-explorer'];
  const [solutions, runs, tasks] = await Promise.all([get('/api/v1/solutions'), get('/api/v1/runs'), get('/api/tasks')]);
  const conversation = tasks.filter((t) => t.parser_type === 'general').sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  const solutionId = solutions[0]?.manifest.id;
  if (solutionId) routes.push(`/solutions/${solutionId}=03-workspace`, `/solutions/${solutionId}?tab=run=03b-workspace-run`, `/solutions/${solutionId}?tab=dev=03c-workspace-dev`);
  routes.push('/runs=04a-runs');
  const done = runs.find((r) => r.status === 'succeeded' && r.artifacts?.length);
  const failed = runs.find((r) => r.status === 'failed');
  if (done) routes.push(`/runs/${done.id}=04-run-console`);
  if (failed) routes.push(`/runs/${failed.id}=04b-run-failed`);
  if (done) {
    routes.push('/artifacts=05a-artifacts');
    for (const [suffix, pick] of [['', (a) => a.name.endsWith('.png')], ['b', (a) => a.name.endsWith('.csv')], ['c', (a) => a.name.endsWith('.json')]]) {
      const artifact = done.artifacts.find(pick);
      if (artifact) routes.push(`/artifacts/${done.id}/${artifact.id}=05${suffix}-artifact-viewer`);
    }
  }
  routes.push(`/plan?q=${encodeURIComponent('统计一段文本的词频')}=06-plan`, conversation ? `/conversations/${conversation.id}=07-conversation` : '/conversations=07-conversations', '/settings=08-settings');
  return routes;
}

const mockRoutes = [
  '/=01-home', '/solutions=02-explorer', '/solutions/demo-curve-fit=03-workspace', '/solutions/demo-curve-fit?tab=run=03b-workspace-run',
  '/solutions/demo-curve-fit?tab=dev=03c-workspace-dev', '/runs=04a-runs', '/artifacts=05a-artifacts',
  `/plan?q=${encodeURIComponent('对实验数据做曲线拟合')}=06-plan`, '/conversations=07-conversations', '/settings=08-settings',
];

const routes = args.routes ? args.routes.split(',') : data === 'mock' ? mockRoutes : await harnessRoutes().catch((error) => {
  console.error(`无法从 Harness 读取路由（${harness}）：${error.message}`); process.exit(1);
});

const require = createRequire(import.meta.url);
console.log(`[capture] ${data} · ${routes.length} 个页面 → ${out}`);
const child = spawn(require('electron'), ['.'], {
  cwd: root, stdio: 'inherit',
  env: { ...process.env, SZH_DEV_URL: '', SZH_DATA: data, SZH_HARNESS_URL: harness, SZH_CAPTURE: out, SZH_CAPTURE_ROUTES: routes.join(','), SZH_CAPTURE_DELAY: args.delay || process.env.SZH_CAPTURE_DELAY || '1800' },
});
child.on('exit', (code) => { console.log(`[capture] 完成（退出码 ${code}）`); process.exit(code ?? 0); });
