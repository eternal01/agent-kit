# Agent Kit

面向 IT 系统架构工作流的可移植知识与技能库，核心内容不依赖特定 Agent SDK。

## 设计原则

- 技能单一职责，触发描述同时声明适用与排除范围。
- `SKILL.md` 只放核心流程；细节按需放入 `references/`。
- 先基于证据工作，明确区分事实、推断和待确认项。
- 优先简单、可验证、可演进和可回滚的方案。
- 运行状态、凭据、缓存和第三方依赖不进入仓库。

## 目录

- `skills/`：按需加载的工作流，详见 [技能目录](skills/README.md)。
- `knowledge/`：长期知识、实践和故障记录。
- `prompts/`：一次性任务的提示模板。
- `rules/`：稳定的行为与质量规则。
- `examples/`：跨技能示例。
- `scripts/`：无第三方依赖的辅助脚本。
- `adapters/`：依赖特定 Agent SDK 或运行时的适配代码；Pi 扩展位于 `adapters/pi/extensions/`。

## 安装技能

本仓库作为技能的唯一维护源时，推荐逐个链接到多个 Agent 共用的 `~/.agents/skills/`：

```bash
./scripts/link-skills.sh
```

首次从旧的复制安装迁移时，显式允许替换同名技能副本：

```bash
./scripts/link-skills.sh --replace-copies
```

需要稳定快照或目标环境不支持软链接时，仍可使用 `./scripts/build-skills.sh` 复制安装。两个脚本都支持通过 `AGENT_SKILLS_DIR` 覆盖目标；执行前应先审查，Agent 通常需要重启才能重新发现技能。

Pi 专属 extensions 保存在 `adapters/pi/extensions/`，使用同样的安装方式：

```bash
./scripts/link-pi-extensions.sh
```

源码虽然归入专属 adapter，运行时仍安装到 Pi 原生路径 `~/.pi/agent/extensions/`；可通过 `PI_EXTENSIONS_DIR` 覆盖目标。详见[Pi 适配说明](adapters/pi/README.md)和[脚本说明](scripts/README.md)。
