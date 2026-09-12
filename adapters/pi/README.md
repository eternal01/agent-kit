# Pi extensions

Pi 专属代码放在本目录；通用 Skill 不依赖 Pi SDK。

## 可用扩展

| 扩展 | 用途 | 文档 |
|---|---|---|
| `anytype` | 搜索和维护个人 Anytype 知识库 | [说明](extensions/anytype/README.md) |
| `github-research` | 只读检索 GitHub，并比较仓库、代码、Issue 和 PR | [说明](extensions/github-research/README.md) |

## 安装

从仓库根目录运行：

```bash
./scripts/link-pi-extensions.sh
```

默认安装到 `~/.pi/agent/extensions/`。设置 `PI_EXTENSIONS_DIR` 可以覆盖目标目录。链接安装后，在 Pi 中运行 `/reload`。

## 验证

```bash
./scripts/verify-pi-extensions.sh
./scripts/verify-pi-extensions.sh --live
```

默认命令执行边界检查、安装生命周期测试、类型检查、单元测试和 smoke test。`--live` 还会检查 `gh` 认证、GitHub API 和 Pi 实际加载。

备份、恢复、快照安装和卸载见[脚本说明](../../scripts/README.md)。
