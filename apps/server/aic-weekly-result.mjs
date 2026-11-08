import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { projectRoot } from './config.mjs';

const runDirectory = join(projectRoot, 'AIC_当次试验');
const channels = ['Ux', 'Uy', 'p'];
const labels = {
  baseline: '正式基线', sensor_3p5: '测量噪声 3.5%', sensor_7p5: '测量噪声 7.5%',
  clock_q_half: '过程噪声减半', clock_range_10: '频率范围 ±10%',
};

export async function readWeeklyRun() {
  return JSON.parse(await readFile(join(runDirectory, 'result.json'), 'utf8'));
}

function byChannel(values) {
  return Object.fromEntries(channels.map((channel, i) => [channel, values[i]]));
}

export function weeklyResult(run, historical, caseIds) {
  const selected = run.selected_trial_id;
  const arms = [...new Set(['baseline', selected])];
  const trials = Object.entries(run.development).map(([trial_id, value]) => ({
    trial_id, version_label: labels[trial_id], selected: trial_id === selected,
    config: run.observer_settings[trial_id], metrics: value.summary, cases: value.cases,
  }));
  const rows = run.confirmation[selected].cases.map((row) => {
    const original = historical.cases.find(item => item.case_id === row.case_id);
    const files = run.artifacts[row.case_id];
    return {
      ...original, case_id: row.case_id, trial_id: selected,
      figure: files ? { file: files.figure, channel: 'Uy', horizons_seconds: [8, 20, 40], contents: ['CFD 参考场', '本轮重建场', '绝对误差'] } : null,
      comparison: arms.map((id) => {
        const version = run.confirmation[id].cases.find(item => item.case_id === row.case_id);
        return {
          version_id: id, version_label: labels[id], trial_id: id, config: run.observer_settings[id],
          relative_l2_mean: byChannel(version.metrics.mean), relative_l2_end: byChannel(version.metrics.end),
          r_score: version.r_score, duration_seconds: version.duration_seconds, meets_internal_target: version.r_score <= 1,
        };
      }),
    };
  });
  const summary = Object.fromEntries(arms.map(id => [id, { ...run.confirmation[id].summary, version_label: labels[id] }]));
  const before = summary.baseline.mean_r.toFixed(6);
  const after = summary[selected].mean_r.toFixed(6);
  const conclusion = `试验 ${run.run_id}。开发集 8 例筛选 4 组候选，锁定 ${labels[selected]}。在 12 例确认集中，平均 R 从 ${before} 到 ${after}，选用配置达标 ${summary[selected].passed_internal_target}/12。`;
  const publicFiles = [
    ['per_case.csv', '本轮逐例指标和实测耗时'], ['selection_lock.json', '开发集选用记录'],
    ['trial_plan.json', '观测协议与候选计划'], ['run.log', '3090 试验日志'],
    ['baseline_cpu_replay.json', '正式基线 CPU 复跑回执'], ['model_package_sha256.txt', '模型包校验值'],
  ];
  for (const id of caseIds) {
    const files = run.artifacts[id];
    if (files) publicFiles.push([files.figure, '本轮参考场、重建场和误差图'], [files.prediction, '160 帧完整预测']);
  }
  return {
    payload: {
      schema_version: 'aic-flowproxy-task-result-v0.1', record_type: 'current_week_result',
      title: 'AIC 流相 · 本周实测', trial_id: run.run_id, protocol: historical.protocol,
      model_called: false, source: 'archived_gpu_run', summary_40s: summary, cases: rows.filter(row => caseIds.includes(row.case_id)),
      batch_metrics: rows, selected_trial_id: selected, candidates: trials, current_week_trials: trials,
      timing: { device: run.device, scope: run.timing_scope }, conclusion,
      model_package_url: process.env.SZH_AIC_MODEL_PACKAGE_URL || null,
      checks: { valid: run.baseline_parameterized_bitwise_equal === true && rows.length === 12 && trials.length === 5, errors: [] },
    },
    files: publicFiles.map(([name, role]) => ({ name, role, source: join(runDirectory, name) })),
    steps: [
      { id: 'split', status: 'completed', summary: '开发集 8 例用于筛选，确认集 12 例在锁定后打开。4 帧启动场和 76 个观测保持不变。' },
      { id: 'selection', status: 'completed', summary: conclusion },
      { id: 'artifacts', status: 'completed', summary: '已挂接本轮 3090 运行的原始指标、日志和完整预测。该任务载入已完成试验。' },
    ],
  };
}
