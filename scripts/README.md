# Scripts

命令默认从仓库根目录运行。

## Skills

| 命令 | 作用 | 是否写入 |
|---|---|---|
| `./scripts/link-skills.sh` | 将 Skill 链接到 Agent Skills 目录 | 是 |
| `./scripts/link-skills.sh --dry-run` | 预览链接和冲突 | 否 |
| `./scripts/build-skills.sh` | 复制独立 Skill 快照 | 是 |
| `./scripts/validate-skills.mjs` | 检查结构、引用、目录和触发契约 | 否 |
| `node --test ./tests/skills/validate-skills.test.mjs` | 运行验证器测试 | 否 |

默认目标是 `~/.agents/skills/`，可用 `AGENT_SKILLS_DIR` 覆盖。链接脚本默认不替换普通目录；迁移旧副本时显式使用 `--replace-copies`。脚本会删除指向本仓库、但源码已经移除的失效链接，不处理其他来源。

验证器不调用模型。`evals/triggers.json` 是可审查的发现契约，不是实际模型准确率报告。

## 文档

```bash
./scripts/check-docs.mjs
node --test ./tests/scripts/check-docs.test.mjs
```

检查相对链接、空占位 README、代码块外的模板残留和同文件重复段落。文风需要人工评审，不使用 AI 文本检测器。

## Pi extensions

| 命令 | 作用 |
|---|---|
| `./scripts/link-pi-extensions.sh` | 链接安装扩展 |
| `./scripts/link-pi-extensions.sh --replace-copies --dry-run` | 预览替换已有副本 |
| `./scripts/build-pi-extensions.sh` | 安装不含 `node_modules` 的快照 |
| `./scripts/uninstall-pi-extensions.sh --dry-run` | 预览卸载 |
| `./scripts/uninstall-pi-extensions.sh --restore-latest` | 卸载并恢复最近备份 |
| `./scripts/verify-pi-extensions.sh` | 运行边界、生命周期、测试、类型和 smoke 检查 |
| `./scripts/verify-pi-extensions.sh --live` | 追加 `gh`、GitHub API 和 Pi 加载检查 |

默认目标是 `~/.pi/agent/extensions/`，可用 `PI_EXTENSIONS_DIR` 覆盖。替换普通目录前，脚本会备份到 Pi agent 目录下的 `backups/agent-kit/pi-extensions/`；可用 `PI_EXTENSIONS_BACKUP_DIR` 更改位置。

快照带 `.agent-kit-managed` 标记。卸载脚本只删除指向本仓库的链接或带有效标记的快照，不删除未知目录。
