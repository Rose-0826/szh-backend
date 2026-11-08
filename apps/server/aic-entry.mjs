import { access, copyFile, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { projectRoot } from './config.mjs';
import { readWeeklyRun, weeklyResult } from './aic-weekly-result.mjs';

export class AicMaterialsError extends Error {
  constructor(message) { super(message); this.code = 'aic_materials_missing'; }
}

const sampleDir = (root) => join(root, '03_真实样例');

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

export async function resolveAicMaterials(explicit) {
  const candidates = [explicit, process.env.SZH_AIC_MATERIALS, resolve(projectRoot, 'AIC_流相_两组开工材料_20261105'), resolve(projectRoot, '../../AIC_流相_两组开工材料_20261105'), resolve(projectRoot, '../AIC_流相_两组开工材料_20261105')].filter(Boolean);
  for (const dir of candidates) {
    if (await exists(join(sampleDir(dir), 'aic_result_example.json'))) return dir;
  }
  throw new AicMaterialsError('未找到 AIC「流相」开工材料。请把材料放在工作区，或设置 SZH_AIC_MATERIALS。');
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    return Object.fromEntries(header.map((key, index) => [key, cells[index]]));
  });
}

function percent(group) {
  return Object.fromEntries(Object.entries(group).map(([key, value]) => [key, Number((Number(value) * 100).toFixed(4))]));
}

function close(left, right) {
  return Math.abs(Number(left) - Number(right)) < 1e-9;
}

function six(value) {
  return Number(value).toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

export async function loadAicCatalog(explicit) {
  const root = await resolveAicMaterials(explicit);
  const example = JSON.parse(await readFile(join(sampleDir(root), 'aic_result_example.json'), 'utf8'));
  const rows = parseCsv(await readFile(join(sampleDir(root), '同批12例_40秒对照.csv'), 'utf8'));
  const selection = JSON.parse(await readFile(join(root, '04_服务器原始记录', 'selection_lock.json'), 'utf8'));
  const runtime = JSON.parse(await readFile(join(root, '04_服务器原始记录', 'current_runtime.json'), 'utf8'));
  return { root, example, rows, selection, runtime };
}

function versionFromCsv(row, prefix, versionId, versionLabel, systemSha) {
  const relativeL2Mean = {
    Ux: Number(row[`${prefix}_mean_l2_Ux`]),
    Uy: Number(row[`${prefix}_mean_l2_Uy`]),
    p: Number(row[`${prefix}_mean_l2_p`]),
  };
  const relativeL2End = {
    Ux: Number(row[`${prefix}_end_l2_Ux`]),
    Uy: Number(row[`${prefix}_end_l2_Uy`]),
    p: Number(row[`${prefix}_end_l2_p`]),
  };
  const rScore = Number(row[`${prefix}_R`]);
  return {
    version_id: versionId,
    version_label: versionLabel,
    system_sha256: systemSha,
    relative_l2_mean: relativeL2Mean,
    relative_l2_end: relativeL2End,
    relative_l2_mean_percent: percent(relativeL2Mean),
    relative_l2_end_percent: percent(relativeL2End),
    r_score: rScore,
    meets_internal_target: rScore <= 1,
    duration_seconds: null,
    duration_status: '未记录',
  };
}

function enrichVersion(version) {
  return {
    ...version,
    relative_l2_mean_percent: percent(version.relative_l2_mean),
    relative_l2_end_percent: percent(version.relative_l2_end),
    duration_seconds: version.duration_seconds ?? null,
    duration_status: version.duration_seconds == null ? '未记录' : '已记录',
  };
}

export function buildAicPayload(catalog, caseIds) {
  const { example, rows, selection, runtime } = catalog;
  const parentSha = example.cases[0].comparison.find((item) => item.version_id === 'parent').system_sha256;
  const selectedSha = selection.system_sha256;
  const byId = new Map(rows.map((row) => [row.case_id, row]));
  const display = new Map(example.cases.map((item) => [item.case_id, item]));
  const issues = [];
  if (example.protocol.future_observation_count !== 76) issues.push('观测预算不是 76 个标量。');
  if (rows.length !== 12) issues.push('确认批应为 12 例。');
  if (example.summary_40s.parent.passed_internal_target !== 7 || example.summary_40s.selected.passed_internal_target !== 12) issues.push('12 例内部目标通过数与开工材料不一致。');
  if (selection.selected !== 'coverage_rollout32_step1500') issues.push('历史选用版本编号与 selection_lock 不一致。');
  for (const item of example.cases) {
    const row = byId.get(item.case_id);
    const parent = item.comparison.find((version) => version.version_id === 'parent');
    const selected = item.comparison.find((version) => version.version_id === 'selected');
    if (!row || !close(row.parent_R, parent.r_score) || !close(row.selected_R, selected.r_score)) issues.push(`${item.case_id} 的展示样例与 12 例对照不一致。`);
    if (parent.system_sha256 !== parentSha || selected.system_sha256 !== selectedSha) issues.push(`${item.case_id} 的系统摘要与选用记录不一致。`);
    if (parent.meets_internal_target !== (parent.r_score <= 1) || selected.meets_internal_target !== (selected.r_score <= 1)) issues.push(`${item.case_id} 的内部目标与 R 不一致。`);
  }

  const batchMetrics = rows.map((row) => ({
    case_id: row.case_id,
    geometry_shape: row.geometry_shape,
    comparison: [
      versionFromCsv(row, 'parent', 'parent', '历史父版', parentSha),
      versionFromCsv(row, 'selected', 'selected', '现用正式版', selectedSha),
    ],
    selected_minus_parent_r: Number(row.selected_minus_parent_R),
    figure: null,
    duration_status: '未记录',
  }));

  const cases = caseIds.map((caseId) => {
    const shown = display.get(caseId);
    const row = byId.get(caseId);
    if (shown) {
      return {
        case_id: shown.case_id,
        case_label: shown.case_label,
        geometry: shown.geometry,
        comparison: shown.comparison.map(enrichVersion),
        input_metadata_file: shown.input_metadata_file ? basename(shown.input_metadata_file) : null,
        input_data_file: shown.input_data_file ? basename(shown.input_data_file) : null,
        figure: shown.figure ? { ...shown.figure, file: basename(shown.figure.file) } : null,
        snapshot_keys: shown.snapshot_keys,
        duration_status: '未记录',
      };
    }
    return {
      case_id: caseId,
      case_label: row.geometry_shape,
      geometry: { shape: row.geometry_shape },
      comparison: [
        versionFromCsv(row, 'parent', 'parent', '历史父版', parentSha),
        versionFromCsv(row, 'selected', 'selected', '现用正式版', selectedSha),
      ],
      input_metadata_file: null,
      input_data_file: null,
      figure: null,
      snapshot_keys: null,
      duration_status: '未记录',
    };
  });

  const selectedSummary = example.summary_40s.selected;
  const parentSummary = example.summary_40s.parent;
  const candidates = [
    {
      trial_id: 'parent',
      role: 'baseline',
      label: '历史父版',
      selected: false,
      system_sha256: parentSha,
      config: { source: '同批12例确认批父版' },
      metrics: {
        case_count: parentSummary.case_count,
        passed_internal_target: parentSummary.passed_internal_target,
        mean_r: parentSummary.mean_r,
        worst_r: parentSummary.worst_r,
        relative_l2_mean: parentSummary.relative_l2_mean,
        relative_l2_mean_percent: percent(parentSummary.relative_l2_mean),
      },
      duration_seconds: null,
      duration_status: '未记录',
      outcome: 'baseline_compared',
    },
    ...selection.candidates.map((item) => {
      const selected = item.name === selection.selected;
      return {
        trial_id: item.name,
        role: selected ? 'historical_selected' : 'historical_candidate',
        label: selected ? '现用正式版' : item.name,
        selected,
        system_sha256: item.system_sha256,
        config: {
          checkpoint_sha256: item.checkpoint_sha256,
          source_counts: item.source_counts,
          training_manifest_sha256: item.training_manifest_sha256,
          no_development_truth_in_banks: item.no_development_truth_in_banks,
          source_path: item.system_path,
        },
        metrics: selected ? {
          case_count: selectedSummary.case_count,
          passed_internal_target: selectedSummary.passed_internal_target,
          mean_r: selectedSummary.mean_r,
          worst_r: selectedSummary.worst_r,
          relative_l2_mean: selectedSummary.relative_l2_mean,
          relative_l2_mean_percent: percent(selectedSummary.relative_l2_mean),
        } : null,
        metrics_status: selected ? '确认批12例已汇总' : '本包只记录配置，没有该候选的逐例误差',
        duration_seconds: null,
        duration_status: '未记录',
        outcome: selected ? 'historical_selected' : 'historical_config_only',
      };
    }),
  ];

  const timing = {
    scope: '独立 8 个已支持轮廓，各重复 3 次',
    applies_to_display_cases: false,
    device: runtime.device,
    load_seconds: runtime.load_seconds,
    protocol: runtime.protocol,
    note: '这是正式版在另外八个工况上的推理耗时。两个展示工况的 duration_seconds 为空，不能把下表填回去。',
    rows: runtime.case_results.map((item) => ({
      case_id: item.id,
      shape: item.shape,
      median_seconds: item.median_seconds,
      repeats_seconds: item.seconds,
      future_scalar_count: item.input_budget,
      role: item.role,
    })),
  };

  const conclusion = `确认批 12 例、40 秒窗口：历史父版通过 ${parentSummary.passed_internal_target}/${parentSummary.case_count}，平均 R 为 ${six(parentSummary.mean_r)}；现用正式版通过 ${selectedSummary.passed_internal_target}/${selectedSummary.case_count}，平均 R 为 ${six(selectedSummary.mean_r)}。展示工况耗时未记录。本周 4—6 组观察器试验尚未写入。`;

  return {
    schema_version: 'aic-flowproxy-task-result-v0.1',
    record_type: 'historical_result',
    title: example.title,
    model_called: false,
    protocol: example.protocol,
    summary_40s: {
      parent: { ...parentSummary, relative_l2_mean_percent: percent(parentSummary.relative_l2_mean) },
      selected: { ...selectedSummary, relative_l2_mean_percent: percent(selectedSummary.relative_l2_mean) },
    },
    cases,
    batch_metrics: batchMetrics,
    candidates,
    selected_trial_id: selection.selected,
    current_week_trials: [],
    current_week_status: '未写入。王筠昊完成 4—6 组观察器与校准参数试验后，按 candidates 的字段追加，基线继续参加比较。',
    timing,
    conclusion,
    checks: {
      valid: issues.length === 0,
      errors: issues,
      rules: [
        '内部目标为 R ≤ 1',
        '相对 L2 原值是比例，百分比由原值乘 100，保留 4 位小数',
        '展示工况没有耗时记录时写明未记录',
        '独立计时不回填到展示工况',
      ],
    },
    files: [],
    process: [],
  };
}

function filePlan(catalog, caseIds) {
  const display = new Map(catalog.example.cases.map((item) => [item.case_id, item]));
  const planned = [
    { name: '同批12例_40秒对照.csv', source: join(sampleDir(catalog.root), '同批12例_40秒对照.csv'), role: '确认批逐例对照' },
    { name: '独立8工况_RTX3090计时.csv', source: join(sampleDir(catalog.root), '独立8工况_RTX3090计时.csv'), role: '独立计时，不回填展示工况' },
  ];
  for (const caseId of caseIds) {
    const item = display.get(caseId);
    if (!item) continue;
    if (item.figure?.file) planned.push({ name: basename(item.figure.file), source: join(sampleDir(catalog.root), item.figure.file), role: `${item.case_label}的参考场、重建场和误差图` });
    if (item.input_metadata_file) planned.push({ name: basename(item.input_metadata_file), source: join(sampleDir(catalog.root), item.input_metadata_file), role: `${item.case_label}输入说明` });
    if (item.input_data_file) planned.push({ name: basename(item.input_data_file), source: join(sampleDir(catalog.root), item.input_data_file), role: `${item.case_label}输入数据` });
  }
  return planned;
}

export function buildProcess(payload) {
  const historical = payload.candidates.filter((item) => item.role !== 'baseline').length;
  return [
    { id: 'protocol', status: 'completed', summary: `观测设置保持不变：${payload.protocol.startup_frames} 帧完整启动场，随后 ${payload.protocol.observation_updates} 次、每次 ${payload.protocol.points_per_update} 个 ${payload.protocol.observation_channel} 测点，共 ${payload.protocol.future_observation_count} 个标量。` },
    { id: 'baseline', status: 'completed', summary: payload.conclusion },
    { id: 'candidates', status: 'completed', summary: `已返回历史基线和 ${historical} 条历史候选配置。选用版本是 ${payload.selected_trial_id}。其余历史候选只有配置，没有逐例误差。` },
    { id: 'metrics', status: 'completed', summary: `逐例指标覆盖确认批 ${payload.batch_metrics.length} 例，本次请求展示 ${payload.cases.length} 例。` },
    { id: 'timing', status: 'completed', summary: '展示工况耗时未记录。独立 8 工况计时单独放在 timing，不回填到展示工况。' },
    { id: 'files', status: 'completed', summary: `已挂接 ${payload.files.length} 个可下载文件。` },
    { id: 'pending', status: 'completed', summary: '本周 4—6 组观察器与校准参数试验尚未写入。完成后按同一字段替换当次结果。' },
  ];
}

export async function runAicEntry({ task, artifactDir, signal, gate, runner, materialsDir }) {
  if (signal?.aborted) throw new Error('run_stopped');
  if (gate) await gate(signal);
  if (signal?.aborted) throw new Error('run_stopped');
  const started = Date.now();
  const catalog = await loadAicCatalog(materialsDir);
  const known = new Set(catalog.rows.map((row) => row.case_id));
  const missing = task.case_ids.filter((caseId) => !known.has(caseId));
  if (missing.length) throw new AicMaterialsError(`确认批中没有这些工况：${missing.join('、')}`);
  const weekly = task.aic_mode === 'current_week' ? weeklyResult(await readWeeklyRun(), catalog.example, task.case_ids) : null;
  const payload = weekly?.payload ?? (runner ? await runner({ task, catalog, signal }) : buildAicPayload(catalog, task.case_ids));
  if (signal?.aborted) throw new Error('run_stopped');
  const files = [];
  const historicalFiles = filePlan(catalog, task.case_ids);
  const sources = weekly ? [...historicalFiles.filter(item => /_input\.(json|npz)$/.test(item.name)), ...weekly.files] : historicalFiles;
  for (const item of sources) {
    await copyFile(item.source, join(artifactDir, item.name));
    const info = await stat(join(artifactDir, item.name));
    files.push({ name: item.name, role: item.role, bytes: info.size });
  }
  payload.files = files;
  payload.process = weekly?.steps ?? buildProcess(payload);
  const documents = {
    'input.txt': `${task.notam}\n`,
    'result.json': payload,
    'checks.json': payload.checks,
    'candidates.json': payload.candidates,
    'metrics.json': { summary_40s: payload.summary_40s, cases: payload.cases, batch_metrics: payload.batch_metrics },
    'timing.json': payload.timing,
    'process.json': payload.process,
    'files.json': payload.files,
    'runtime-summary.json': { runtime: weekly ? 'aic-archived-gpu-run' : 'aic-historical-catalog', model_called: false, record_type: payload.record_type, elapsed_ms: Date.now() - started },
  };
  for (const [name, value] of Object.entries(documents)) {
    await writeFile(join(artifactDir, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  }
  return { payload, names: [...Object.keys(documents), ...files.map((item) => item.name)], elapsed_ms: Date.now() - started };
}
