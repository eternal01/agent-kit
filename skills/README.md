# 技能目录

技能按工作产物划分，避免同一任务被多个技能处理：

| 技能 | 唯一职责 |
|---|---|
| `grilling` | 在高风险或重大歧义下进行对抗性澄清与压力测试 |
| `grill-with-docs` | 对抗性澄清并在确认后持久化术语、决策和 ADR |
| `solution-design` | 澄清需求并形成业务/功能方案 |
| `system-architecture` | 系统边界、质量属性与 C4 架构 |
| `technology-selection` | 比较具体技术或供应商 |
| `architecture-decision` | 记录和维护单项 ADR |
| `implementation-planning` | 将确认的设计拆成实施计划 |
| `software-implementation` | 按确认范围修改代码 |
| `systematic-debugging` | 基于证据定位并修复根因 |
| `code-review` | 只读审查 diff、提交或 PR |
| `coding-standards` | 项目级规范及自动化门禁 |
| `technical-documentation` | 基于已确认事实组织技术文档 |
| `web-research` | 联网检索和核验时效信息 |
| `skill-authoring` | 创建和治理 Agent Skill |
| `completion-verification` | 在完成声明前核验证据 |

每个 `SKILL.md` 只保留触发边界和核心流程；模板、清单和方法细节位于各自的 `references/`，仅在需要时读取。所有引用均相对技能目录。

## 质量门禁

本项目保留各 Agent 的原生 Skill 发现机制，不维护额外的运行时注册表。提交前执行确定性静态验证：

```bash
node ./scripts/validate-skills.mjs
node --test ./tests/skills/validate-skills.test.mjs
```

验证内容包括 frontmatter、目录/名称一致性、名称唯一性、description 的适用与排除边界、相对链接，以及本目录表格与实际 Skill 的双向一致性。
