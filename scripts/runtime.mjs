import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const home = join(root, '.dsh');
mkdirSync(home, { recursive: true });
const child = spawn(process.execPath, [
  join(root, 'node_modules/@deepseek-ai/dsh/lib/bin.js'),
  ...process.argv.slice(2),
], {
  cwd: root,
  env: { ...process.env, DSH_HOME: home },
  stdio: 'inherit',
  windowsHide: true,
});
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => { process.exitCode = code ?? 1; });
