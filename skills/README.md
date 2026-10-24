# Skills

本目录包含 18 个可独立安装的 Agent Skill。每个 Skill 只负责一种工作产物；不确定时，先根据下面的任务入口选择，不要把整条流程同时加载。安装时优先选择所需 Skill 或 profile，避免无关上下文稀释。

## 按任务选择

| 你要做什么 | 使用 |
|---|---|
| 挑战高风险方案、追问重大歧义，必要时记录确认结果 | `grilling` |
| 澄清或比较功能行为、体验与验收，判断现有能力能否满足场景 | `solution-design` |
| 设计跨服务边界、数据流、部署和质量属性，并比较架构演进路径 | `system-architecture` |
| 比较框架、数据库、云服务或供应商 | `technology-selection` |
| 记录或评审已经讨论过的技术决策 | `architecture-decision` |
| 对已确认功能比较代码实施路径与影响面，按需拆成实施任务 | `implementation-planning` |
| 按确认范围编写、修改或重构代码 | `software-implementation` |
| 组织生产事故响应、角色分工、状态更新与交接 | `incident-response` |
| 调查测试失败、缺陷或性能异常的根因 | `systematic-debugging` |
| 只读审查 diff、提交或 PR | `code-review` |
| 做威胁建模、攻击面分析或安全专项审查 | `security-assessment` |
| 制定项目编码约定和自动化门禁 | `coding-standards` |
| 编写或评审 README、API、设计和运维文档 | `technical-documentation` |
| 把资料或学习目标整理成个人阅读笔记 | `learning-note` |
| 联网核验版本、价格、兼容性、漏洞或官方行为 | `web-research` |
| 创建、评审、盘点或行为评测 Agent Skill | `skill-authoring` |
| 整理当前任务状态，交接给下一会话或其他 Agent | `session-handoff` |
| 梳理陌生仓库的入口、模块、调用链和阅读路径 | `codebase-onboarding` |

## 容易混淆的边界

- 按当前请求的产物区分：功能行为、体验和验收归 `solution-design`；服务/部署边界、数据所有权和系统质量属性取舍归 `system-architecture`。背景资料中的长期架构目标不单独触发架构设计。功能已确认、比较代码实施路径或影响面时归 `implementation-planning`，不必要求任务拆解；明确要求直接改代码归 `software-implementation`。仅说“目标已确认”不排除继续比较功能行为；“长期方案”也不等于架构设计。存在实质取舍时按可行性比较，不强凑固定档数。
- 普通 diff 或反馈成立性审查归 `code-review`；明确要求核验并修正审查意见归 `software-implementation`；威胁模型和安全专项归 `security-assessment`。
- 项目文档与陌生读者测试归 `technical-documentation`；个人学习文章和复习材料归 `learning-note`；当前任务状态交接归 `session-handoff`，不自动继续实施或保存文件。
- `web-research` 负责找证据，其他 Skill 负责把证据用于选型、文档或学习材料。
- `grilling` 用于用户明确要求的压力测试，或确实阻塞任务、需要多轮澄清的重大未决问题；安全、权限、生产或迁移标签本身不触发独立访谈。常规风险检查由当前任务 Skill 完成，其他 Skill 不隐式加载它。用户要求留档时才写入术语、决定或 ADR。
- `incident-response` 负责生产事故期间的协调、态势、沟通和恢复验证；`systematic-debugging` 负责可复现的技术根因调查。事故止血可以先于根因确定，但生产操作仍需明确授权。
- 可独立安装的 Skill 应自带完成声明所需的最小证据要求，不依赖本仓库公共规则。Agent Kit 内的完成、修复、可合并或检查通过声明还遵循[项目完成证据规则](../rules/completion-evidence.md)；它不是独立的可发现 Skill。
- `codebase-onboarding` 还原现有系统；`system-architecture` 设计未来的跨服务或部署结构。

## 文件结构

`SKILL.md` 保存触发边界和核心流程。详细方法放在同目录的 `references/`，确定性操作放在 `scripts/`，固定材料放在 `assets/`。`evals/triggers.json` 至少保存 3 个正例和 3 个反例，用于评审发现边界。

本项目沿用各 Agent 的原生 Skill 发现机制，不维护运行时注册表。提交前执行：

```bash
./scripts/validate-skills.mjs
node scripts/validate-skill-evals.mjs
node --test ./tests/skills/validate-skills.test.mjs ./tests/skills/replay-skill-triggers.test.mjs ./tests/benchmarks/validate-skill-evals.test.mjs
```

验证器检查 frontmatter、目录和名称、触发契约、跨 Skill 冲突矩阵、相对链接，以及本目录与实际 Skill 的对应关系。它不调用模型，因此不能证明真实 Agent 一定会按预期触发。真实行为对照的输入准备、运行协议与记录格式见[行为评测](../benchmarks/skill-behavior/README.md)；需在 Pi 中验证自动触发时，可使用[触发回放](../benchmarks/skill-replay/README.md)，运行模型前先预览调用次数。触发回放不能替代任务产物与授权边界的行为评测。
