# 后端能力状态

本表以 2026-11-09 本轮源码审查和本地验证为准。模型替身、历史归档及文本自检分别标记。

| 能力 | 实现状态 | 代码位置 | 已验证行为 | 限制 |
| --- | --- | --- | --- | --- |
| HTTP 服务、健康检查 | 已实现 | `apps/server/main.mjs` | 真实服务启动及健康响应 | 模型标记来自配置，`not_probed` 不验证上游可用性 |
| Harness 与 NOTAM | 已实现，专业覆盖有限 | `tasks.mjs`、`dsh-runner.mjs`、`plugins/notam-schema.mjs` | 任务创建、确认、规则检查、保存和下载，测试注入模型返回 | 本轮未调用真实模型，专业结果待复核 |
| 工具与知识 | 已实现基础能力 | `knowledge.mjs`、`plugins/notam-schema.mjs` | 资料搜索与 NOTAM 校验回归 | 资料读取复用最多八条检索结果，后续资料条目可能查不到 |
| AI 会话 | 已实现 | `tasks.mjs`、`dsh-runner.mjs` | 替身验证多轮、停止、重新发送、重启读取 | 不支持流式答复、对话删除和用户归属。新版客户端未接停止回复 |
| 旧 AIC | 已实现归档装配 | `aic-entry.mjs`、`aic-weekly-result.mjs` | 原工程四项历史样例回归通过 | 依赖授权材料。不会执行新推理 |
| Solution Registry | 已实现基础能力 | `solution-registry.mjs`、`scripts/import-solution.mjs` | 版本持久化、冲突拒绝、查询、非法输入拒绝 | HTTP 导入固定 403。没有资产上传、发布权限模型或版本禁用 |
| 通用 Run | 部分实现 | `solution-runs.mjs` | 单元替身和隔离 HTTP 文本自检覆盖创建、幂等、持久化、失败和下载 | 单进程队列。没有通用 runner 注册、资源隔离或超时治理 |
| Run 取消 | 部分实现 | `solution-runs.mjs` | 文本自检可取消，响应与后续状态分开读取 | 取消请求未持久化，子进程树、收集产物阶段和关闭时序仍有竞态 |
| 任务活动与 Run 事件 | 部分实现 | `task-activity.mjs`、`solution-runs.mjs` | 旧活动测试有真实事件结构，Run 自检 API 的 events 为空 | 无 Run 事件路由、阶段、百分比或日志流。客户端从时间戳派生时间线 |
| Artifact | 已实现基础能力 | `main.mjs`、`solution-runs.mjs` | 自检输出字节可下载并与登记 SHA-256 对照 | 仅 id、run_id、name、size、sha256。无资源库、分页、清理策略 |
| AIC 推理执行器 | 有具体实现，环境依赖 | `solution-runs.mjs`、`scripts/aic/run_solution.py` | 本轮仅审查执行路径 | 未在本轮调用 Python、远程主机或模型。适配器启动服务本机子进程 |
| 远程计算与用户管理 | 尚未实现 | 无相关路由或适配器 | 源码核查 | 远端部署需要运维链路。没有 SSH 调度、鉴权、多租户、配额 |
| Demo 数据 | 仅前端 Mock 或静态样例 | 完整工程 `apps/szh-app/src/lib/api/mock.ts`、`scripts/examples.mjs` | 阅读数据源切换与只读路由 | 不计为 Harness 执行能力。文本词频沙箱是独立的真实本地自检 |

## 本轮验证记录

| 命令或检查 | 本轮结果 |
| --- | --- |
| 原工程 `npm test` | 基线与整理后各执行一次完整回归，均 68 项通过 |
| 原工程 `npm run check` | 已有 PDF 的 SHA-256、来源与契约样例核对通过 |
| 原工程 `npm --prefix apps/szh-app test` | Electron renderer 的 38 项单元测试通过，其中 21 项覆盖 Harness 数据适配 |
| 原工程 `npm run runtime:help` | DSH CLI 启动并显示帮助 |
| 临时快照 `npm ci --no-audit --no-fund`、`npm test` | 按锁文件重新安装成功。64 项通过，4 项旧 AIC 归档测试因样本不随仓库分发而显式跳过 |
| 临时快照 `node apps/server/main.mjs` | 使用隔离端口及无凭据配置启动。health、旧方案、注册方案、任务、Run 五个查询均返回 200 |
| 通过 `node --input-type=module -` 执行临时 HTTP 联调脚本 | 实际启动现有沙箱进程。验证 CLI 导入及冲突、旧任务创建查询、版本查询、HTTP 导入 403、校验成功和失败、Run 幂等、运行失败与取消、快照落盘。四个下载文件长度和 SHA-256 均一致。源码原目录与干净快照均通过 |
| `npm audit --omit=dev` | 发现依赖通告，见 [技术债务](TECH_DEBT.md) |

测试使用 Node.js 24.22.1、npm 11.19.1。旧模型任务和会话通过现有替身测试覆盖。实际模型调用、AIC Python/远程计算、桌面窗口人工操作均未执行。本轮采用 API 冒烟和前端契约测试验证兼容性。
