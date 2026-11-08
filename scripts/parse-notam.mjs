import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { projectRoot } from '../apps/server/config.mjs';
import { runDsh } from '../apps/server/dsh-runner.mjs';
import { checkParsing } from '../apps/server/parsing.mjs';

const notam = process.argv[2] ? await readFile(process.argv[2], 'utf8') : 'Q)KZDV/QMRLC/IV/NBO/A/000/999/3952N10440W005 A)KDEN B)2301010254 C)2301011200 E) DEN RWY 17L/35R CLSD';
const parserType = process.argv[3] || 'runway';
const artifactDir = join(projectRoot, 'var/runs', randomUUID());
await mkdir(artifactDir, { recursive: true });
await writeFile(join(artifactDir, 'input.txt'), notam);
const receipt = await runDsh({ notam, parserType, artifactDir, onEvent: (event) => {
  if (event.type === 'tool/call') console.log('DSH 已调用解析字段工具。');
} });
const checked = checkParsing(receipt.raw, notam, {parserType});
await writeFile(join(artifactDir, 'checked-result.json'), JSON.stringify({ ...checked, professional_review: 'pending', parser_type: parserType, schema_version: parserType === 'report' ? 'report-v1' : 'paper-v1' }, null, 2));
console.log(JSON.stringify({ valid: checked.valid, records: checked.records, errors: checked.errors, tool_calls: receipt.tool_calls.length, artifactDir }, null, 2));
if (!checked.valid) process.exitCode = 1;
