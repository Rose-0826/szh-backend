import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { projectRoot } from '../apps/server/config.mjs';

let count = 0;
for (const directory of ['evaluation/records', 'evaluation/materials-records']) {
  let index;
  try { index = JSON.parse(await readFile(join(projectRoot, directory, 'index.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' && directory === 'evaluation/materials-records') continue; throw error; }
  for (const record of index.records) {
  for (const file of record.files) {
    const target = join(projectRoot, 'var', file);
    await mkdir(join(target, '..'), { recursive: true });
    try { await copyFile(join(projectRoot, directory, file), target, 1); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  count++;
  }
}
console.log(`已载入${count}份真实运行归档。请启动或重启服务查看；载入不调用模型，不覆盖已有记录。`);
