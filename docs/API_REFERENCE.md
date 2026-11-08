# SZH HTTP API

事实来源为 `apps/server/main.mjs` 及对应 Service。当前没有 OpenAPI 生成器。默认地址 `http://127.0.0.1:4782`，仅监听 loopback。没有认证、令牌、会话权限或用户隔离。服务允许任意 CORS Origin，OPTIONS 返回 204。所有正文提交发送 JSON 对象，读取上限 100,000 字节。

成功的 JSON 响应为 `{"mode":"development","data":...}`。错误为 `{"mode":"development","data":{"code":"...","message":"..."}}`。文件和重定向不套 JSON envelope。

## 系统、资料与旧任务

| Method | Path | 请求 | 成功结果 |
| --- | --- | --- | --- |
| GET | `/api/health` | 无 | 200，runtime、model_configured、可选 model/reasoning_effort、model_availability、supported_parsers、supported_solutions、schema_status |
| GET | `/api/solutions` | 无 | 200，静态 NOTAM 和旧 AIC 两个描述 |
| GET | `/api/knowledge/search` | 可选 `q`，空白分词并匹配任一关键词 | 200，最多八条资料索引 |
| GET | `/api/knowledge/{id}` | 资料 ID | 200，索引条目 |
| GET | `/api/tasks` | 无 | 200，任务摘要数组 |
| POST | `/api/tasks` | 见下文 | 201，完整 Task |
| GET | `/api/tasks/{id}` | Task UUID | 200，任务快照及消息 |
| GET | `/api/tasks/{id}/activity` | Task UUID | 200，旧任务活动数组，优先内存活动，其次 DSH 归档 |
| POST | `/api/tasks/{id}/start` | 无需正文 | 202，从 awaiting_confirmation 确认启动 |
| POST | `/api/tasks/{id}/stop` | 无需正文 | 202，停止任务，返回快照 |
| POST | `/api/tasks/{id}/resume` | 无需正文 | 202，从 stopped、interrupted、failed 或 invalid_output 继续 |
| POST | `/api/tasks/{id}/messages` | `{"content":"..."}` | 202，入队后返回任务和 messages |
| POST | `/api/tasks/{id}/messages/stop` | 无需正文 | 202，停止当前回复，返回任务 |
| GET | `/api/tasks/{id}/artifacts/{name}` | URL 编码的允许文件名 | 200，最近一次尝试的文件与 Content-Disposition |

创建 Task 的真实输入：

- NOTAM：`notam` 必填，1–30,000 字符。可选 `solution_id: "aviation-notam"`、`parser_type: "runway" | "report"`、单行 `notam_id`（不超过 100 字符）与 `timeout_seconds`（默认 180，整数 10–300）。创建后等待确认。
- 通用对话：`solution_id: "general"`、`content`（去空白后非空，原始长度最多 10,000）。Task 是 `ready`，首条消息自动排队。消息状态独立于 Task。
- 旧 AIC：`solution_id: "aic-flowproxy"`，兼容 `solution: "aic-flowproxy"`。可选 `case_ids`（授权确认集内 1–12 项）、`note`（不超过 10,000 字符）、`aic_mode: "current_week"`、`timeout_seconds`。默认历史模式和两个展示工况。该入口需要归档文件。

## 注册版本与 Run

| Method | Path | 请求 | 成功结果或固定响应 |
| --- | --- | --- | --- |
| GET | `/api/v1/solutions` | 无 | 200，版本记录数组，含 manifest、status、published_at |
| GET | `/api/v1/solutions/{id}/versions` | Solution ID | 200，指定方案的版本数组，未知 ID 为空 |
| GET | `/api/v1/solutions/{id}/versions/{version}` | 精确版本 | 200，一条版本记录 |
| POST | `/api/v1/solutions/{id}/versions/{version}/validate-input` | 输入对象本身 | 200，`{"valid":true,"input":...}` |
| POST | `/api/v1/solutions/import` | 无可用 HTTP 参数 | 固定 403 maintainer_cli_required；用维护者 CLI 导入 |
| GET | `/api/v1/runs` | 无 | 200，按创建时间倒序的完整 Run 数组 |
| POST | `/api/v1/runs` | 见下文 | 202，Run 快照 |
| GET | `/api/v1/runs/{id}` | Run UUID | 200，Run 快照 |
| POST | `/api/v1/runs/{id}/cancel` | 无需正文 | 202，取消请求已发出，返回含 cancel_requested 的快照 |
| GET | `/api/v1/runs/{id}/artifacts` | Run UUID | 200，成果列表 |
| GET | `/api/v1/runs/{id}/artifacts/{artifactId}/download` | Run UUID、Artifact UUID | 200，文件字节和下载文件名 |

```json
{
  "solution_id": "aic-inference",
  "version": "0.1.0",
  "input": { "case_id": "cylinder_Re143.41_cy0.208_D1.184" },
  "request_id": "client-generated-id"
}
```

`source_run_id` 可选，服务检查该 Run 存在。请求编号须为非空字符串。相同编号与相同序列化指纹返回已存在记录，变更配置应使用新编号。参数顺序变化可能改变指纹。Run 返回 id、solution_id、version、manifest、input、request_id、fingerprint、status、created_at，以及可选 source_run_id、started_at、finished_at、error。每个 Run 带 events 和 artifacts 数组。

Run 的已知状态为 `queued`、`running`、`succeeded`、`failed`、`cancelled`，以及取消响应里的 `cancel_requested`。取消响应后继续轮询详情，详情可能暂时仍为 queued/running。中断的运行重启后被标记 failed。当前 events 为空，不存在订阅或流式事件路由。Artifact 字段是 id、run_id、name、size、sha256。下载 MIME 由扩展名映射，客户端可按文件名判断展示类型。

## 错误与兼容性

| HTTP | 常见 code |
| --- | --- |
| 400 | invalid_json、invalid_artifact、invalid_input、request_id_required、request_conflict、runtime_unavailable、invalid_run_state |
| 403 | maintainer_cli_required |
| 404 | not_found、task_not_found、source_not_found、version_not_found、run_not_found、artifact_not_found |
| 409 | invalid_task_state、invalid_message_state、reply_in_progress |
| 413 | request_too_large |
| 422 | invalid_notam、unsupported_solution、unsupported_parser、invalid_notam_id、invalid_budget、invalid_message、invalid_note、unknown_case、aic_materials_missing |
| 500 | 未预期服务或文件错误。可能携带底层 error.code，message 通常为通用提示 |
| 503 | service_closing |

模型超时或失败通常写入任务、消息或 Run 的状态，已受理请求不以 HTTP 错误回报后续执行失败。Manifest 结构错误及版本冲突由 CLI 报错和退出码处理。

`GET/HEAD /` 返回 302 到 `/preview/` 并保留查询字符串。服务以固定白名单提供旧预览、旧 `/index.html`、样例和资料文件。旧预览构建需要完整工程。新版 Electron 使用自身构建和上述 JSON API。
