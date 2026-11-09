// Development launcher: Vite dev server (HMR) + Electron pointed at it.
// Usage: npm run dev:desktop   (env: SZH_HARNESS_URL, SZH_DATA=mock|harness)
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const electron = require('electron'); // resolves to the Electron binary path

const tsc = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'electron/tsconfig.json'], { cwd: root, stdio: 'inherit' });
if (tsc.status !== 0) process.exit(tsc.status ?? 1);

const server = await createServer({ root, configFile: join(root, 'vite.config.ts') });
await server.listen();
const url = server.resolvedUrls?.local[0] ?? 'http://127.0.0.1:5183/';
console.log(`[szh] renderer: ${url}`);

const app = spawn(electron, ['.'], { cwd: root, stdio: 'inherit', env: { ...process.env, SZH_DEV_URL: url.replace(/\/$/, '') } });
const stop = async (code = 0) => { await server.close(); process.exit(code); };
app.on('exit', (code) => void stop(code ?? 0));
process.on('SIGINT', () => { app.kill(); void stop(0); });
