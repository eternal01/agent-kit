# 技能安装脚本

默认目标为多个 Agent 可共用的 `~/.agents/skills/`。两个脚本只处理与本仓库同名的技能，不删除目标目录中的其他技能；可通过 `AGENT_SKILLS_DIR` 覆盖目标。

## 链接安装（推荐）

仓库是唯一维护源时使用逐技能软链接，源码修改会直接反映到各 Agent 的读取路径：

```bash
./scripts/link-skills.sh
```

脚本默认拒绝覆盖普通目录和指向其他位置的链接。检查迁移操作：

```bash
./scripts/link-skills.sh --replace-copies --dry-run
```

确认后，将包含 `SKILL.md` 的同名复制副本替换为链接：

```bash
./scripts/link-skills.sh --replace-copies
```

使用逐技能链接而不是链接整个 `~/.agents/skills/`，可以保留其他来源的技能。仓库移动后需要重新运行脚本；Agent 通常需要重启才能刷新启动时扫描的技能名称和描述。

## 快照复制

发布稳定快照、隔离测试或目标环境不支持软链接时使用：

```bash
./scripts/build-skills.sh
```

测试时可指定临时目标：

```bash
AGENT_SKILLS_DIR=/tmp/agent-skills ./scripts/build-skills.sh
```

复制脚本会替换同名目标目录，因此会将该技能固定为执行时的仓库版本，后续源码修改不会自动同步。
