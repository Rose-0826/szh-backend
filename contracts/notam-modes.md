# NOTAM两种输出模式 v0.1

2026年10月30日补充。已有任务和接口样例保留原格式，新任务可选择以下模式。

- `runway`：论文附录第9—10页的五字段JSON数组，`schema_version: paper-v1`。
- `report`：研究报告TC-001至TC-005整理的业务JSON对象，`schema_version: report-v1`。

创建任务仍调用POST /api/tasks，例如：

```json
{"notam":"A)ZYTX E)本场不接收备降航班。","notam_id":"ZYSH_C0381/24","parser_type":"report","timeout_seconds":300}
```

`notam_id`选填，最多100字符；`parser_type`省略时沿用runway，网页默认选择report。创建与确认分开，其他启动、停止、继续、查询和下载接口不变。result可以是数组或对象，客户端按parser_type展示。列表新增parser_type。

report保留原报告字段名，包括restriction_Type、Diversion_Restriction、industrialaction。案例中不是每次都出现的字段保持可选。validity对象和open枚举是已注明的工程补充，详细字段与规则见solutions/aviation-notam/report.schema.json和report-rules.json。

checks.evidence.items给出字段、原文和字符偏移；只对可定位的原文片段高亮。runway模式的状态、时间和局部影响归并说明放在checks.interpretation，不向五字段结果额外塞字段。

professional_review: pending表示人工尚未复核，不代表已有资料规则尚未采用。旧任务中的paper-v1-draft保留为其当时版本。人工复核、格式检查和真实模型是否执行分别展示。
