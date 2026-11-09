# SZH 桌面客户端（Electron + React + TypeScript）

SZH 科研工作台的新版桌面客户端：方案库、方案工作空间（概览 / 运行 / 记录 / 开发）、运行页、成果查看、AI 侧栏与对话。客户端只通过 HTTP 访问 Harness（`apps/server`），不直接运行任何专业模型。

## 环境要求

- Node.js 22.19 或以上（已在 24.22.1 验证），npm。
- Windows 10/11（主要验证平台）。macOS / Linux 可构建，未系统验证。

## 启动

```sh
# 1. 后端（项目根目录）
npm ci
npm start                      # Harness，默认 http://127.0.0.1:4782

# 2. 客户端（apps/szh-app）
cd apps/szh-app
npm ci
npm run build && npm start     # 构建后启动 Electron
# 或开发模式（Vite 热更新 + Electron）：
npm run dev:desktop
```

Windows 下也可以在根目录双击 `Start-SZH-Next.cmd`：自动安装依赖、启动 Harness（如未运行）、首次构建并打开客户端。参数 `rebuild` 强制重新构建，`mock` 以演示数据源启动。

| 环境变量 | 作用 |
|---|---|
| `SZH_HARNESS_URL` | Harness 地址，默认 `http://127.0.0.1:4782` |
| `SZH_DATA` | `mock` 或 `harness`，启动时的数据源（也可在“设置”中切换） |

### 没有已发布方案时

新的 Harness 数据目录中方案注册表为空。可以：

- 用隔离沙箱联调（推荐，不写入项目 `var/`）：`node scripts/harness-sandbox.mjs --port 4790 --dir <新建的临时目录>`，再以 `SZH_HARNESS_URL=http://127.0.0.1:4790` 启动客户端。沙箱发布一个文本词频自检方案（真实执行，生成 JSON / CSV / PNG / 日志）和 AIC 方案（未配置 PyTorch 环境时运行会如实失败）。
- 或在“设置”中切换到演示数据源。演示数据在浏览器内计算，所有记录带“演示”标识。

## 常用命令

```sh
npm run typecheck   # TypeScript 检查（renderer + electron）
npm test            # Vitest 单元测试
npm run build       # 生成 dist/ 与 dist-electron/
npm run capture -- --data harness --harness http://127.0.0.1:4790   # 按路由截取 Electron 页面
```

## 代码结构

```text
electron/        主进程（窗口、下载、截图模式）与 preload（最小桥接）
src/app/         路由、跨页 UI 状态
src/lib/api/     DataSource 接口；harness.ts（真实后端）与 mock.ts（演示）两个实现；queries.ts（全部读写 hooks）
src/components/  设计系统（ui/）与业务组件
src/features/    页面：home、solutions、runs、artifacts、assistant、settings
src/styles/      tokens.css 是唯一允许写原始颜色值的地方
```

约定：页面只通过 `lib/api/queries.ts` 的 hooks 访问数据；新增后端字段先更新契约（`contracts/openapi/`），再改 `harness.ts` 的映射。

## 当前已知限制

这些是后端尚未提供的能力，客户端已明确降级，不显示虚构数据：

- **运行过程**：Harness 只报告状态与时间戳，没有实时日志、阶段或进度。运行页的“状态记录”由时间戳整理；执行日志在运行成功后作为成果提供，失败的运行没有日志。
- **取消**：后端不持久化“正在取消”，客户端在本页面内保持该状态直到终态；刷新后显示后端实际状态。
- **方案就绪状态**：提交前无法得知执行环境是否可用，只有创建运行时才会收到“环境不可用”的错误。
- **表单**：Harness 注册时拒绝 `x-advanced` 等界面注解，真实方案的参数全部平铺；不支持文件输入、数组和嵌套对象。
- **AI 助手**：侧栏对话与页面的对应关系只保存在本机；页面信息以文本形式附在首条消息中，模型无法读取成果文件内容；回复可能需要数分钟。
- **列表**：运行列表每次全量读取，记录很多时会变慢。
- **安全**：Harness 无认证，只用于可信本机；不要把端口暴露到网络。
- **NOTAM 与旧 AIC 归档**：仍由旧客户端承载（`Start-SZH.cmd`、`Open-SZH-Desktop.cmd`），新客户端不显示。
