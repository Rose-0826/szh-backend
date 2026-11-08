# 公共接口起点 v0.1

以下是客户端开发使用的只读样例入口，执行 `npm run examples` 后可访问。所有响应都有 `mode: fixture`，页面在样例模式显示“接口样例”。

- `GET /api/health`：样例服务状态，明确 `runtime_connected` 和 `model_called` 为 false。
- `GET /api/solutions`：一份待领域确认的 Solution 清单项，包在 `data` 下。
- `GET /api/examples/task`：任务、计划、步骤和待确认事项。样例未实际执行，`runtime_executed` 为 false。
- `GET /api/knowledge/sources`：来源目录。
- `GET /api/examples/knowledge-hit`：原文引用的返回形式。

任务接口已在4782端口提供创建、启动、停止、继续与结果查询，根地址提供真实工作台，完整约定见 `docs/后端联调说明_v0.1.md`。已使用DeepSeek-V4.1-Flash完成六类小样例真实调用。4780保留为明确标注的历史样例入口。

共享对象至少保留这些信息：

- 任务：编号、目标、Solution 编号与版本、工作方式、状态、计划。
- 步骤：编号、实际状态、简明说明、专业详情、产物引用。
- 知识引用：来源编号、原文、页码或条款位置。
- 检查：所检查的结果、判断、依据和待确认事项。

知识片段的 `pdf_page` 从1计数；`printed_page` 是文档印刷页码，封面与目录可能导致两者不同。原文换版后重新定位引用。
