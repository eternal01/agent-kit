# GitHub Research

为 Pi 提供只读的跨仓库 GitHub 检索能力，用于发现成熟开源产品、实现和相关讨论。

## 依赖

- GitHub CLI (`gh`)
- 已完成 `gh auth login`

安装并认证：

```bash
brew install gh
gh auth login
gh auth status
```

## 安装到 Pi

在仓库根目录执行：

```bash
./scripts/link-pi-extensions.sh
```

然后重启 Pi，或在 Pi 中执行 `/reload`。

运行只读环境诊断：

```text
/github-research-doctor
```

该命令检查 `gh` 版本、github.com 认证和 Core/Search API 剩余额度，不输出认证信息。

## 工具

提供两个只读工具：

- `github_research`：跨仓库搜索并返回适合批量比较的紧凑结果
- `github_repository_details`：对一个 `owner/name` 候选读取完整的有限证据和可选 README

`github_research` 支持：

- `repositories`：搜索仓库，并返回适合批量比较的紧凑候选摘要
- `code`：跨仓库搜索代码
- `issues`：搜索 Issue
- `pull_requests`：搜索 PR
- `queries`：在主要查询之外执行最多 10 个附加查询
- `expand_query`：自动补充名称/描述、Topic 或标题/正文范围查询
- `max_pages`：每个查询最多读取 5 页
- `concurrency`：限制并发查询数，范围 1–5
- `cache_ttl_seconds`：成功 GET 请求的进程内短期缓存，默认 300 秒
- `sort: trending`：综合查询命中次数、Star/Fork 和最近 push；归档仓库会被硬降权；这是启发式热度，不是 GitHub 官方趋势数据
- `pi_resources_only`：仅保留由 `package.json#pi` 或约定目录验证的 Pi Skill/Extension 仓库；扩展会先扩大候选池、验证，再应用最终 `limit`
- `inspect_top`：对最多 20 个候选执行紧凑成熟度分析
- `readme_top`：仅为前 0–5 个被检查仓库附带 README，默认 0
- `analyze_maturity`：采集工程、社区和维护证据，默认启用

多查询结果按仓库、代码位置或 Issue/PR URL 去重，并附带 `match_count`、`matched_queries` 和 `match_origins`。单次工具调用最多发出 25 个 Search API 请求，避免无界分页快速耗尽 GitHub Search 限额；达到预算时返回 `request_budget_exhausted: true`。

批量结果只返回最新 Release 和 Release 样本数量，不返回完整 Release 列表；README 也默认关闭。需要核验具体候选时，再调用 `github_repository_details`。输出超限时会逐级裁剪 README 和可选证据，但保留全部结果及检查项的身份，不再通过删除尾部候选满足预算。

仓库详情还会检查 `package.json#pi.extensions`、`package.json#pi.skills` 以及 `extensions/`、`skills/` 文件布局，并返回 `pi_package_verified`、`pi_resources` 和 `pi_verification_reasons`。仅在 README 中提到 Pi 不会被视为 Pi 扩展。

示例提示：

```text
请使用 github_research 搜索成熟的开源工作流引擎，比较前 10 个项目，并分析 License、活跃度、架构和可借鉴设计。
```

该扩展只执行 GitHub API 的 GET 请求，不提供评论、创建、合并或删除操作。

## 成熟度分析

开启 `analyze_maturity` 后，扩展会对 `inspect_top` 范围内的仓库读取最多 10 个 Release、100 个贡献者、100 个开放 Issue、30 个近期关闭 Issue，以及递归文件树。批量搜索默认不携带 README，避免 Top 20 比较结果被长文档截断。需要单仓库完整证据时调用 `github_repository_details`。评分上限为 100，分项为：

| 分项 | 上限 | 证据 |
|---|---:|---|
| adoption | 20 | Star、Fork，采用对数缩放 |
| maintenance | 20 | 最近 push 时间 |
| releases | 15 | 最近 Release 和 Release 样本数 |
| engineering | 25 | CI、测试、文档、贡献指南、安全策略、行为准则 |
| governance | 10 | GitHub 检测到的 SPDX License |
| community | 10 | 贡献者样本和 Issue 关闭时间中位数 |

归档仓库总分最高为 25。输出同时包含 `components`、`signals`、`warnings`、Issue 样本和仓库架构信号。该评分仅用于候选比较，不代表安全审计、代码质量保证或采用建议；API 样本达到上限时会明确标记。

## 安全与输出边界

- GitHub README、Issue、PR 和代码均被视为不可信外部内容。
- README 摘要按 UTF-8 字节限制截断，并检测常见提示注入语句。
- 工具输出保持为有效 JSON，并有总大小上限。
- 外部内容中的命令不会被扩展自动执行。
- Pi 取消当前工具调用时，扩展会终止对应的 `gh` 子进程。

## 开发验证

扩展目录内：

```bash
cd adapters/pi/extensions/github-research
npm run verify   # 单元测试、类型检查、注册 smoke test
pi -e ./index.ts --list-models
```

仓库根目录内：

```bash
./scripts/verify-pi-extensions.sh
./scripts/verify-pi-extensions.sh --live
```
