# Scripts

## Skills

```bash
./scripts/link-skills.sh
./scripts/link-skills.sh --replace-copies --dry-run
./scripts/build-skills.sh
```

默认安装到 `~/.agents/skills/`，可用 `AGENT_SKILLS_DIR` 覆盖目标。链接安装适合开发；复制安装适合稳定快照。脚本只处理本仓库中的同名技能，不删除其他技能。

## Pi Extensions

```bash
./scripts/link-pi-extensions.sh
./scripts/link-pi-extensions.sh --replace-copies --dry-run
./scripts/build-pi-extensions.sh
```

默认安装到 `~/.pi/agent/extensions/`，可用 `PI_EXTENSIONS_DIR` 覆盖目标。脚本只处理 `adapters/pi/extensions/` 下包含 `index.ts` 的一级扩展，不删除其他扩展。链接安装后可在 Pi 中执行 `/reload`。
