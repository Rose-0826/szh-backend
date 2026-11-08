import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import {checkParsing} from '../apps/server/parsing.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), 'utf8'));
const sources = await readJson('knowledge/sources.json');
const solution = await readJson('solutions/aviation-notam/solution.json');
const example = await readJson('contracts/task.example.json');
const hit = await readJson('contracts/knowledge-hit.example.json');
const sourceIds = new Set(sources.sources.map((source) => source.id));
assert.equal(sourceIds.size, sources.sources.length, '来源编号不能重复');
for (const source of sources.sources) {
  const document = await readFile(join(root, source.local_path));
  assert.equal(document.subarray(0, 5).toString(), '%PDF-', '原文文件必须是PDF');
  assert.equal(createHash('sha256').update(document).digest('hex'), source.sha256, '原文文件与登记校验值不符');
}
for (const id of solution.knowledge_sources) assert(sourceIds.has(id), 'Solution引用了未登记来源');
for (const skill of solution.skills) assert((await stat(join(root, 'solutions/aviation-notam', skill))).isFile());
assert.equal(solution.status, 'development');
assert.equal(solution.schema_status, 'source_based');
assert.deepEqual(solution.parser_types, ['runway', 'report']);
const reportCases = await readJson('evaluation/report-cases.json');
for (const item of reportCases.cases) {
  const checked = checkParsing(JSON.stringify(item.expected), item.notam, {parserType: 'report', notamId: item.notam_id});
  assert(checked.valid, item.id + ': ' + checked.errors.join('; '));
}
assert.equal(example.runtime_executed, false);
assert.equal(example.data_origin, 'interface_fixture');
assert.equal(example.task.solution.id, solution.id);
assert(sourceIds.has(hit.source_id));
assert.equal(hit.data_origin, 'interface_fixture');
assert(hit.locator.pdf_page > 0 && hit.quote.length > 0);
console.log('初始包检查通过：Solution、来源、PDF校验和与接口样例相互对应。');
console.log('本检查不代表真实模型运行或专业任务验收。');
