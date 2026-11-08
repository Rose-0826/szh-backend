# AIC 流相执行入口 v0.1

2026年11月5日。负责人：童宇昕。样例和字段与王筠昊提供的 `AIC_流相_两组开工材料_20261105` 对齐。

航行通告接口保持不变。`GET /api/health` 仍返回 `supported_parsers: ["runway", "report"]`，并增加 `supported_solutions: ["aviation-notam", "aic-flowproxy"]`。

## 创建与运行

`POST /api/tasks`

```json
{
  "solution_id": "aic-flowproxy",
  "case_ids": ["ellipse_a1p4_Re169.08_cy-0.368_D1.171"],
  "note": "可选补充说明",
  "timeout_seconds": 180
}
```

不传 `case_ids` 时使用两个带图工况：代表椭圆 `ellipse_a1p4_Re169.08_cy-0.368_D1.171`，困难长方柱 `rectangle_a1p7_Re133.03_cy0.304_D1.131`。工况必须来自确认批 12 例。创建返回 `awaiting_confirmation`，此时不读取模型。

确认、停止、继续、查询和下载沿用原任务接口：

- `POST /api/tasks/{id}/start`
- `POST /api/tasks/{id}/stop`
- `POST /api/tasks/{id}/resume`
- `GET /api/tasks/{id}`
- `GET /api/tasks/{id}/artifacts/{name}`

第三阶段客户端工程另有消息接口。消息写在 `messages` 中，不改 `result`：

- `POST /api/tasks/{id}/messages`，正文 `{ "content": "哪个指标改善了" }`
- `POST /api/tasks/{id}/messages/stop`

一次只执行一个任务，其余排队。服务重启后，排队和运行中的任务变为 `interrupted`，已完成结果保留，可继续。

## 返回里有什么

完成后 `result.record_type` 为 `historical_result`，`model_called` 为 false。材料来自 2026-10-07 的确认记录和 2026-10-25 正式版口径。

- `protocol`：4 帧完整启动场，随后 19 次、每次 4 个 Uy 测点，共 76 个标量；40 秒、160 帧、64×64，通道 Ux、Uy、p。
- `summary_40s`：同一批 12 例。父版通过 7/12，平均 R 为 0.834115。正式版通过 12/12，平均 R 为 0.633023。
- `cases`：本次请求的工况。带图的两例含几何、父版和正式版误差、输入文件名和 Uy 对照图。
- `batch_metrics`：确认批 12 例的逐例相对 L2、R 和内部目标。
- `candidates`：历史父版基线，加 `selection_lock.json` 里的 4 条历史配置。选用版本是 `coverage_rollout32_step1500`。另外 3 条只有配置，`metrics` 为 null。
- `current_week_trials`：空数组。本周 4—6 组观察器与校准参数试验由王筠昊写入后再替换。
- `timing`：独立 8 工况、各 3 次、RTX 3090 的正式版推理耗时。`applies_to_display_cases` 为 false。两个展示工况的 `duration_seconds` 为 null，`duration_status` 为“未记录”。
- `process`：协议、基线、候选、指标、耗时、文件和待写入试验七步。
- `checks.valid`：展示样例与 12 例对照一致，且 R≤1 与 `meets_internal_target` 一致时为 true。

相对 L2 原值是比例。`relative_l2_mean_percent` 由原值乘 100，保留 4 位小数。代表椭圆正式版 Uy 的 0.026377134371970312 对应 2.6377。

## 可下载文件

`result.json`、`checks.json`、`candidates.json`、`metrics.json`、`timing.json`、`process.json`、`files.json`、`runtime-summary.json`、`input.txt`。

请求了带图工况时，还可下载对应的 Uy 对照图、输入 JSON 和 NPZ，以及 `同批12例_40秒对照.csv`、`独立8工况_RTX3090计时.csv`。

材料目录默认查找工作区中的 `AIC_流相_两组开工材料_20261105`。也可以设置 `SZH_AIC_MATERIALS`。
