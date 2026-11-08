# 新版 Electron 与 Harness 的契约

依据完整工程中的 `apps/szh-app/electron/main.ts`、`preload.ts` 和 `src/lib/api/{harness,datasource,contract}.ts(x)`。该客户端使用 TypeScript、React、HashRouter 和 TanStack Query，和旧预览分开构建。Electron 注入 `window.szhDesktop.harnessUrl`，默认 `http://127.0.0.1:4782`，可由进程环境 `SZH_HARNESS_URL` 覆盖。非 Electron 的 Vite 开发页通过同源 `/api` 代理。当前 renderer CSP 允许 loopback 的 HTTP 连接，换成远程地址还需评估客户端 CSP。远程部署可由授权运维通过本机转发接入。后端不自带 SSH 转发。

| 操作 | 实际数据契约 | 客户端处理 |
| --- | --- | --- |
| 连接状态 | `GET /api/health` | 区分 HTTP 可达与模型已配置，配置存在不表示模型可用 |
| 方案列表与详情 | `GET /api/v1/solutions`、`GET /api/v1/solutions/{id}/versions` | 按 manifest.id 合并，语义版本排序。原始记录按版本返回 |
| 注册 | CLI 写入 Registry | HTTP 导入固定 403，客户端当前无发布能力 |
| 配置与校验 | `input_schema`、`POST .../{version}/validate-input` | 渲染可识别的 Schema 控件，服务端校验最终输入。AJV 的 message 文本由客户端尽力映射到字段 |
| 创建 Run | `POST /api/v1/runs` | 明确 solution_id、version、input、request_id，可传 source_run_id。重试同请求应复用编号 |
| 状态与取消 | `GET /api/v1/runs[/{id}]`、`POST /api/v1/runs/{id}/cancel` | 轮询快照。实际时间线从 created_at、started_at、finished_at 派生。取消受理后继续查最终状态 |
| Artifact | Run 内的 artifacts 数组、`GET .../artifacts/{artifactId}/download` | 用扩展名推断类型，展示名称和大小。下载拿文件字节 |
| AI 对话 | `GET /api/tasks[/{id}]`、`POST /api/tasks`（general）、`POST /api/tasks/{id}/messages` | 仅将 parser_type 为 general 的 Task 映射为通用对话，轮询消息快照。后端停止回复路由尚未接入新版客户端 |

数据源默认 Harness，除非 `?data=mock`、Electron `SZH_DATA=mock` 或已保存 Mock 偏好。切换时建立新的查询缓存。Mock 的状态、时间线和成果不进入真实服务。网络不可达映射为 `network_unreachable`，HTTP 错误读取 `data.code` 和 `data.message`。界面保留未连接提示，由用户选择数据源。

## 当前差距

- 前端理解 `x-advanced`、`x-unit` 等 UI 注解，Registry 注册使用严格 AJV，未注册关键词会拒绝。当前生产定义使用受支持的 Schema 关键词。后续需共同决定注解结构。
- 服务未提供真实阶段、百分比、暂停、等待确认、GPU 用量、实时日志推送。Run.events 为空。不要把派生时间线或 Mock 步骤显示成真实执行日志。
- Artifact 没有统一 MIME、来源关系、分页、归档清理或即时写入流。下载失败应显示真实 HTTP 错误。
- 方案没有上传、授权发布、收藏同步、远程资源探测或对话级专业执行权限。服务默认无认证，仅用于可信本机环境。
- `/api/solutions` 是旧静态目录。新版目录取 `/api/v1/solutions`，新数据目录会返回空数组，注册后才有方案。

路由、错误和请求形状见 [HTTP API](API_REFERENCE.md)。
