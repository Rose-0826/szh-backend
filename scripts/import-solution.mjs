import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { SolutionRegistry } from '../apps/server/solution-registry.mjs';
import { projectRoot } from '../apps/server/config.mjs';
const file = process.argv[2];
if (!file) { console.error('用法：node scripts/import-solution.mjs manifest.json [存储目录]'); process.exitCode = 1; }
else {
  const manifest = JSON.parse(await readFile(resolve(file), 'utf8'));
  const registry = new SolutionRegistry(resolve(process.argv[3] || join(projectRoot, 'var/solution-versions')));
  try { const record = await registry.publish(manifest); console.log(`已发布 ${record.manifest.id}@${record.manifest.version}`); }
  catch (error) { console.error(`${error.code}: ${error.message}`); process.exitCode = 1; }
}
