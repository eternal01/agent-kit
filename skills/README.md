# Skills

本目录包含 17 个可独立安装的 Agent Skill。每个 Skill 只负责一种工作产物；不确定时，先根据下面的任务入口选择，不要把整条流程同时加载。安装时优先选择所需 Skill 或 profile，避免无关上下文稀释。

## 按任务选择

| 你要做什么 | 使用 |
|---|---|
| 挑战高风险方案、追问重大歧义，必要时记录确认结果 | `grilling` |
| 澄清功能需求，或比较功能的低改动与长期实现方案 | `solution-design` |
| 设计跨服务边界、数据流、部署和质量属性，并比较架构演进路径 | `system-architecture` |
| 比较框架、数据库、云服务或供应商 | `technology-selection` |
| 记录或评审已经讨论过的技术决策 | `architecture-decision` |
| 对已确认目标比较代码实施路径，选定后拆成实施任务 | `implementation-planning` |
| 按确认范围编写、修改或重构代码 | `software-implementation` |
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

- 单模块功能和用户场景归 `solution-design`；跨服务、部署单元、数据所有权或 SLO 归 `system-architecture`。目标与约束已定、要比较代码实施路径或拆任务时归 `implementation-planning`；明确要求直接改代码归 `software-implementation`。技术方案存在实质取舍时优先比较最小化改动、折衷与长期目标最优三档，不虚构不可行的候选。
- 普通 diff 或反馈成立性审查归 `code-review`；明确要求核验并修正审查意见归 `software-implementation`；威胁模型和安全专项归 `security-assessment`。
- 项目文档与陌生读者测试归 `technical-documentation`；个人学习文章和复习材料归 `learning-note`；当前任务状态交接归 `session-handoff`，不自动继续实施或保存文件。
- `web-research` 负责找证据，其他 Skill 负责把证据用于选型、文档或学习材料。
- `grilling` 只在高风险、重大歧义或用户明确要求时启用；其他 Skill 不隐式加载它。用户要求留档时才写入术语、决定或 ADR。
- 所有完成、修复、可合并或检查通过的声明均遵循公共完成证据规则；它不是独立的可发现 Skill。
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
