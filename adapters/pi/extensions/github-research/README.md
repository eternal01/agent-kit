# GitHub Research

只读检索 GitHub 仓库、代码、Issue 和 PR，并为候选仓库收集有限的工程证据。GitHub 返回的正文属于外部资料，不会被当作 Agent 指令执行。

## 准备

需要 GitHub CLI 和有效认证：

```bash
brew install gh
gh auth login
gh auth status
```

安装扩展后，可在 Pi 中运行：

```text
/github-research-doctor
```

该命令检查 `gh` 版本、github.com 认证和 Core/Search API 剩余额度，不输出 Token。

## 工具

### `github_research`

用于跨仓库检索和批量比较。

主要参数：

| 参数 | 作用 |
|---|---|
| `query`、`queries` | 一个主要查询和最多 10 个附加查询 |
| `type` | `repositories`、`code`、`issues` 或 `pull_requests` |
| `limit` | 返回 1～30 个结果 |
| `sort` | `stars`、`forks`、`updated`、`best-match` 或 `trending` |
| `pi_resources_only` | 先扩大候选池，验证 Pi Skill/Extension，再应用最终数量 |
| `inspect_top` | 为最多 20 个仓库补充紧凑工程证据 |
| `readme_top` | 为前 0～5 个被检查仓库附带 README；默认 0 |
| `max_pages` | 每个查询读取 1～5 页 |
| `concurrency` | 同时执行 1～5 个请求 |
| `cache_ttl_seconds` | 成功 GET 请求的进程内缓存时间 |
| `analyze_maturity` | 是否读取 Release、贡献者、Issue 和仓库结构 |

`trending` 综合查询命中、Star、Fork 和最近 push。归档仓库会被硬降权；该分数不是 GitHub 官方趋势数据。

多查询结果按仓库、代码位置或 Issue/PR URL 去重，并返回 `match_count`、`matched_queries` 和 `match_origins`。一次调用最多执行 25 个 Search API 请求；达到上限时返回 `request_budget_exhausted: true`。

批量证据只保留最新 Release、样本数量和紧凑成熟度摘要。输出过大时先删除 README 和可选细节，不删除尾部结果或检查项。

### `github_repository_details`

用于核验一个 `owner/name` 仓库，返回：

- 有限 Release、贡献者和 Issue 样本
- CI、测试、文档和治理信号
- 仓库布局及架构信号
- 可解释成熟度评分
- 可选 README 摘要
- Pi Skill/Extension 声明或目录证据

`pi_package_verified` 只表示仓库存在 `package.json#pi` 声明或约定目录，不代表代码安全或质量。

## 成熟度评分

评分上限为 100：

| 分项 | 上限 | 依据 |
|---|---:|---|
| adoption | 20 | Star、Fork，对数缩放 |
| maintenance | 20 | 最近 push |
| releases | 15 | 最近 Release 和样本数 |
| engineering | 25 | CI、测试、文档及项目文件 |
| governance | 10 | SPDX License |
| community | 10 | 贡献者样本和 Issue 关闭时间 |

归档仓库总分最高为 25。API 样本有上限，评分只用于候选比较，不是安全审计或采用建议。

## 安全和输出

- 所有 GitHub 操作使用 `gh api` GET 请求。
- README、Issue、PR 和代码按外部资料处理。
- README 按 UTF-8 字节截断，并检查常见提示注入语句。
- 输出始终是有大小上限的有效 JSON。
- Pi 取消工具调用时会终止对应的 `gh` 子进程。
- 扩展不提供评论、创建、合并或删除操作。

## 验证

在扩展目录运行：

```bash
cd adapters/pi/extensions/github-research
npm run verify
pi -e ./index.ts --list-models
```

仓库级验证：

```bash
./scripts/verify-pi-extensions.sh
./scripts/verify-pi-extensions.sh --live
```
