import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { TaskService } from '../apps/server/tasks.mjs';
import { loadModelConfig, projectRoot } from '../apps/server/config.mjs';

const suite = JSON.parse(await readFile(new URL('../evaluation/notam-cases.json', import.meta.url), 'utf8'));
const config = loadModelConfig();
const service = await TaskService.open();
const report = { run_at: new Date().toISOString(), model: config.model, reasoning_effort: config.reasoningEffort, schema_version: suite.schema_version, professional_review: 'pending', cases: [] };
try {
  for (const item of suite.cases) {
    const created = await service.create({ notam: item.notam, timeout_seconds: 300 });
    await service.start(created.id);
    let task;
    do { await new Promise((resolve) => setTimeout(resolve, 400)); task = service.get(created.id); } while (['queued', 'running', 'stopping'].includes(task.status));
    const checks = [];
    checks.push(Boolean(task.checks?.valid) === item.expected_valid);
    checks.push(task.runtime_executed);
    if (item.runways) {
      checks.push(JSON.stringify((task.result || []).map((row) => row.runway).sort()) === JSON.stringify([...item.runways].sort()));
      checks.push((task.result || []).every((row) => row.airport === item.airport && row.affect_region === item.affect_region && row.affect_actype === null && row.flight_type === 'International,Domestic,Regional'));
    }
    if (item.expected_empty) checks.push(Array.isArray(task.result) && task.result.length === 0);
    if (item.expect_warning) checks.push(task.checks?.warnings?.some((warning) => warning.includes(item.expect_warning)));
    if (item.expect_error) checks.push(task.checks?.errors?.some((error) => error.includes(item.expect_error)));
    const result = { id: item.id, name: item.name, origin: item.origin, source: item.source, task_id: task.id, status: task.status, passed: checks.every(Boolean), checks, result: task.result, validation: task.checks, error: task.error, runtime: task.runtime };
    report.cases.push(result);
    console.log(JSON.stringify({ case: result.id, passed: result.passed, status: result.status, task_id: task.id }));
  }
} finally {
  await service.close();
  await mkdir(join(projectRoot, 'evaluation/results'), { recursive: true });
  await writeFile(join(projectRoot, 'evaluation/results/notam-live-20261028.json'), JSON.stringify(report, null, 2));
}
if (report.cases.length !== suite.cases.length || report.cases.some((item) => !item.passed)) process.exitCode = 1;
