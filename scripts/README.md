# Scripts

命令默认从仓库根目录运行。

## Skills

| 命令 | 作用 | 是否写入 |
|---|---|---|
| `./scripts/link-skills.sh` | 将全部 Skill 链接到 Agent Skills 目录 | 是 |
| `./scripts/link-skills.sh --profile core-development` | 链接一个 Skill profile | 是 |
| `./scripts/link-skills.sh --skill code-review --prune` | 链接指定 Skill 并移除本仓库其他链接 | 是 |
| `./scripts/link-skills.sh --list` | 列出可用 Skill 和 profile | 否 |
| `./scripts/link-skills.sh --dry-run` | 预览链接和冲突 | 否 |
| `./scripts/build-skills.sh` | 复制全部独立 Skill 快照 | 是 |
| `./scripts/build-skills.sh --profile knowledge` | 复制一个 Skill profile 快照 | 是 |
| `./scripts/validate-skills.mjs` | 检查结构、引用、目录和触发契约 | 否 |
| `./scripts/validate-minimal-change-benchmarks.mjs` | 检查最小充分变更基准场景结构 | 否 |
| `node scripts/validate-skill-evals.mjs [场景目录] [runs.json路径]` | 检查行为评测场景；可选检查成对运行记录的结构与比较条件 | 否 |
| `node --test ./tests/skills/validate-skills.test.mjs ./tests/skills/replay-skill-triggers.test.mjs` | 运行验证器与回放器测试（模拟 Pi） | 否 |
| `node scripts/replay-skill-triggers.mjs` | 预览 Pi 回放的模型调用次数 | 否 |
| `node scripts/replay-skill-triggers.mjs --live --model PROVIDER/MODEL` | 在只读模拟仓库中对比有/无 Skill 的实际触发与输出；会调用模型并写本地报告 | 是 |
| `./tests/scripts/skill-install.test.sh` | 运行 Skill 安装生命周期测试 | 否 |

默认目标是 `~/.agents/skills/`，可用 `AGENT_SKILLS_DIR` 覆盖。`--skill` 和 `--profile` 可重复组合；未选择时安装全部。可用 profile 为 `core-development`、`architecture`、`governance` 和 `knowledge`。`--prune` 只删除指向本仓库的链接，或带 `.agent-kit-managed` 标记的快照。链接脚本默认不替换普通目录；迁移旧副本时显式使用 `--replace-copies`。

验证器不调用模型。`evals/triggers.json` 与 `evals/conflicts.json` 是可审查的发现契约，不是实际模型准确率报告。行为评测的用例准备、授权、运行协议和记录格式见[行为对照评测](../benchmarks/skill-behavior/README.md)；Pi 触发回放的用法、费用和数据边界见[回放说明](../benchmarks/skill-replay/README.md)。回放器仅检查触发，不能替代行为评测；运行记录结构通过也不证明证据属实或行为通过。

`core-development` 包含 `session-handoff`；安装生命周期测试在临时目标目录中验证链接、快照与裁剪，不更改真实安装目录。

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
