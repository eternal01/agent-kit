# Agent Kit

一组可移植的 Agent Skills，以及为 Pi 编写的本地扩展。Skill 处理需求澄清、架构、实施、审查、调试、文档、学习笔记和安全评估；扩展提供 GitHub 调研与 Anytype 访问。

## 从任务开始

- 不确定该用哪个 Skill：查看[任务索引](skills/README.md)。
- 安装或更新 Skill：运行 `./scripts/link-skills.sh`。
- 使用 Pi 扩展：查看[Pi 扩展](adapters/pi/README.md)。
- 修改 Skill 或扩展：先运行对应验证，再运行仓库级检查。

## 安装 Skills

开发环境建议使用软链接，使仓库修改立即生效：

```bash
./scripts/link-skills.sh
```

首次替换旧的复制安装：

```bash
./scripts/link-skills.sh --replace-copies
```

需要独立快照时使用：

```bash
./scripts/build-skills.sh
```

默认目标是 `~/.agents/skills/`。设置 `AGENT_SKILLS_DIR` 可以改到其他目录。Agent 通常需要重启才能重新发现 Skill。

## 安装 Pi 扩展

```bash
./scripts/link-pi-extensions.sh
```

默认目标是 `~/.pi/agent/extensions/`。安装、备份、恢复和卸载行为见[脚本说明](scripts/README.md)。

## 验证

```bash
./scripts/validate-skills.mjs
./scripts/check-docs.mjs
node --test ./tests/skills/validate-skills.test.mjs ./tests/scripts/check-docs.test.mjs
./scripts/verify-pi-extensions.sh
```

需要同时检查 `gh` 认证、GitHub API 和 Pi 实际加载时：

```bash
./scripts/verify-pi-extensions.sh --live
```

Skill 验证器检查结构和触发契约，不调用模型。它不能代替真实 Agent 中的行为回放。

## 目录

- `skills/`：自包含的工作流和按需资料。
- `rules/`：本仓库特有的稳定约定。
- `adapters/pi/`：依赖 Pi SDK 或运行时的扩展。
- `scripts/`：安装、卸载和验证脚本。
- `tests/`：脚本、Skill 和扩展的测试。

凭据、缓存、运行状态和第三方仓库内容不进入版本库。
