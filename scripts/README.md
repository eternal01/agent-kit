# Scripts

## Skills

```bash
./scripts/link-skills.sh
./scripts/link-skills.sh --replace-copies --dry-run
./scripts/build-skills.sh
node ./scripts/validate-skills.mjs
node --test ./tests/skills/validate-skills.test.mjs
```

默认安装到 `~/.agents/skills/`，可用 `AGENT_SKILLS_DIR` 覆盖目标。链接安装适合开发；复制安装适合稳定快照。脚本只处理本仓库中的同名技能，不删除其他技能。

`validate-skills.mjs` 检查 frontmatter、目录与名称一致性、名称唯一性、适用/排除边界、相对链接，以及 `skills/README.md` 目录覆盖。验证器只提供确定性静态质量门禁，不创建运行时注册表，也不调用模型。

## Pi Extensions

```bash
./scripts/link-pi-extensions.sh
./scripts/link-pi-extensions.sh --replace-copies --dry-run
./scripts/build-pi-extensions.sh
./scripts/uninstall-pi-extensions.sh --dry-run
./scripts/uninstall-pi-extensions.sh --restore-latest
./scripts/verify-pi-extensions.sh
./scripts/verify-pi-extensions.sh --live
```

默认安装到 `~/.pi/agent/extensions/`，可用 `PI_EXTENSIONS_DIR` 覆盖目标。替换普通目录前会备份到 Pi agent 目录的 `backups/agent-kit/pi-extensions/`，可通过 `PI_EXTENSIONS_BACKUP_DIR` 覆盖。快照安装带 `.agent-kit-managed` 标记并排除 `node_modules`；卸载脚本只删除指向本仓库的链接或带有效管理标记的快照，不删除未知目录。

`verify-pi-extensions.sh` 默认执行扩展边界检查、Skill 静态验证、Shell 语法、安装/恢复集成测试及扩展自己的测试、类型检查和 smoke test；`--live` 额外检查 `gh` 认证、GitHub API 和 Pi 实际加载。链接安装后可在 Pi 中执行 `/reload`。
