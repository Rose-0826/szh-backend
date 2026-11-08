# 后端入口

从工程根目录执行 `npm start` 启动后端，`npm test` 运行回归。运行环境、配置和验证方式见 [项目 README](../../README.md)。

- `main.mjs` 提供 HTTP 接口和旧预览资源入口。
- `tasks.mjs` 和 `dsh-runner.mjs` 提供 NOTAM 任务、通用对话及 DSH 执行。
- `solution-registry.mjs` 和 `solution-runs.mjs` 管理版本、运行与成果。

见 [架构](../../docs/BACKEND_ARCHITECTURE.md)、[HTTP API](../../docs/API_REFERENCE.md) 和 [Electron 契约](../../docs/FRONTEND_BACKEND_CONTRACT.md)。
