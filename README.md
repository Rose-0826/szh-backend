# SZH Harness 后端

SZH 是面向科研和专业任务的本地优先 Harness。当前版本由两条后端链路组成：旧任务接口承载 NOTAM 解析、通用对话和 AIC 归档查看；版本化接口承载 Solution 注册、Run 和 Artifact。两条链路共用 HTTP 服务，独立记录状态。

新版 Electron + React 客户端在 `apps/szh-app` 下，通过 HTTP 调用后端，启动方式与已知限制见 [apps/szh-app/README.md](apps/szh-app/README.md)。Windows 下可用根目录 `Start-SZH-Next.cmd` 一键启动后端与客户端。完整工程还保留旧 WinForms/WebView2 客户端及 Web 预览，后端快照仅保留旧入口回归所需源码与清单。部署边界见 [架构](docs/BACKEND_ARCHITECTURE.md) 和 [客户端契约](docs/FRONTEND_BACKEND_CONTRACT.md)。

## 启动

要求 Node.js 22.19 或以上和 npm。本次验证使用 Node.js 24.22.1。首次启动在项目根目录执行：

```sh
npm ci
npm start
```

默认仅监听 `127.0.0.1:4782`。使用 `GET /api/health` 验证服务。根地址会跳转到旧 Web 预览，该预览需要完整工程的前端构建产物。新版 Electron 直接访问 API。服务默认读写本机 `var/`，启动时会恢复或标记中断的已有记录。

默认无需模型凭据即可查询状态和注册方案。真实对话和 NOTAM 推理需要配置模型。已有模型设置优先级为进程环境 > 根目录 `.env` > 私有配置文件。私有配置路径由 `SZH_MODEL_ENV_FILE` 在进程环境中指定，未指定时依次使用用户目录下的 `.config/szh/model.env` 或旧的 `.config/autoresearch/glm.env`。详见 [.env.example](.env.example)。从进程环境设置端口和 AIC 选项，复制 `.env.example` 不会配置这些变量。

| 变量 | 用途 |
| --- | --- |
| `SZH_MODEL_PROVIDER`、`SZH_MODEL`、`SZH_MODEL_BASE_URL`、`SZH_MODEL_API_KEY`、`SZH_MODEL_REASONING_EFFORT` | DSH 模型路由、凭据与推理强度 |
| `AUTORESEARCH_MODEL`、`AUTORESEARCH_MODEL_BASE_URL`、`AUTORESEARCH_MODEL_API_KEY` | 历史配置兼容回退 |
| `SZH_PORT` | HTTP 监听端口，默认 4782 |
| `SZH_AIC_MATERIALS` | 旧 AIC 归档资料目录，按需授权取得 |
| `SZH_AIC_PYTHON`、`SZH_AIC_PACKAGE` | AIC 适配器的服务端解释器与受控运行包目录，须同时设置 |
| `SZH_AIC_MODEL_PACKAGE_URL` | 旧归档结果的可选交付链接，由维护者在部署环境配置 |
| `SZH_SERVICE_URL` | 旧资料评估脚本使用的服务地址 |

## 注册、测试与联调

```sh
node scripts/import-solution.mjs solutions/aic-flowproxy/manifest-v01.json
npm test
```

导入命令默认写入 `var/solution-versions`，可传入第二个参数指定注册目录。注册只校验定义，不表示模型环境可运行。重复版本拒绝覆盖。默认全量测试中，四项旧 AIC 归档测试在缺少授权样本时会显示跳过。拥有完整材料的开发者可设置 `SZH_AIC_MATERIALS` 后单独执行 `node --test tests/aic-entry.test.mjs`。测试使用替身模型或固定归档，不需要在线凭据。

```sh
node apps/szh-app/scripts/harness-sandbox.mjs --port 4790 --dir <一个新建的临时目录>
```

沙箱启动真实 HTTP 路由和本地文本词频自检执行器，可创建 Run、取消和下载文件。请使用专属临时目录，避免使用 `--fresh`，它会递归清除目标目录。沙箱的 DSH 目录随 TaskService 的数据目录隔离，私有模型配置仍按正常优先级加载。无凭据联调时只运行文本词频自检。该自检用于验证基础链路。

`npm run check` 核对归档 PDF、引用和样例一致性，需先从 `knowledge/sources.json` 登记的发布者 URL 获取 PDF 并放入其 `local_path`。原始 PDF、实验归档、模型与真实会话通过独立渠道管理。`npm run samples:load` 和 `npm run evaluate:materials` 属于完整交付工程的历史材料工具，需独立取得授权材料并在隔离环境使用。

## 开发边界

API 没有用户认证或访问控制，当前用于可信本机环境。专业计算环境由部署方提供，仓库内的 AIC 适配器是在服务所在机器启动 Python。通用远程调度、Run 阶段流、暂停、上传资产、成果生命周期和多用户权限均待完善。

- [能力状态](docs/BACKEND_STATUS.md)
- [真实 API](docs/API_REFERENCE.md)
- [技术债务与安全记录](docs/TECH_DEBT.md)
