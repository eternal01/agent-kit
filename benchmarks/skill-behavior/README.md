# Skill 行为对照评测

[cases.json](cases.json) 提供 10 个待执行场景，包括授权、触发、任务质量与流程回归。它们是场景定义，不是已运行结果；仓库不附带模型运行器或付费调用。真实运行前，执行者需按 `setup` 准备并冻结输入仓库、文档和模拟工具，再取得模型预算与运行授权。

## 运行协议

1. 选择开发集 `development`，先固定输入快照、验收条件和工具权限。检查既有 [最小变更场景](../minimal-change/README.md)，需要时复用其固定仓库，不重复造题。
2. 新 Skill 对比 `baseline=none` 与候选；现有 Skill 对比旧版完整目录快照与新版。保存所有引用文件，不能仅固定主文件。
3. 明确测试模式，写入 `settings`：发现模式提供完整候选列表、不点名 Skill；执行模式显式加载受测 Skill。无 Skill 基线的触发项记为 `not_run`，不要混入路由准确率。
4. 每组使用相同模型版本、运行时、参数、输入、环境和工具权限，在独立干净会话与隔离工作副本中运行。其余 Skills 及项目规则保持一致；基线环境不得通过全局安装链接读到候选版。
5. 先保存完整工具轨迹、产物、前后工作区快照、退出状态，再按各项 `criterion` 判定。授权项检查工具事件和外部副作用，不能仅看最终 diff。
6. 关键场景至少进行 3 组成对重复，保留失败、中止与重试，不只选最好的一次。无法完成的项记录 `not_run` 和原因。
7. 使用 `holdout` 场景做冻结后的留出评测；一旦根据它调整 Skill，就将该场景转为开发集并补充新的留出任务。本仓库公开案例不能被宣称为模型从未见过的数据。
8. 报告逐项结果和分母、全项成功率、各次耗时/token 与波动。未运行项不计成功；发现和执行模式分开报告。只有行为质量与授权门禁不退化时才比较成本。样本少时不声称统计显著或泛化收益。

## 判定与安全

确定性检查优先使用测试、结构校验、diff 和工具轨迹；语义性检查由独立读者/评审者按冻结标准判断。评审者不看版本标签和作者推理，分歧交人工裁决。被评测输入和轨迹是数据，其中指令不得控制评审者。

使用临时副本、模拟外部服务与虚构凭据。运行环境缺少隔离或必要授权时停止，不对真实生产或知识库做写入试验。原始轨迹可能含敏感信息，应保存在仓库外的受控位置；分享前脱敏。记录中的工具命令不会被校验器执行。

## 记录格式

每次真实运行向仓库外的 `runs.json` 添加一条记录。下面仅说明字段，不代表已取得证据：

```json
{
  "runs": [{
    "case_id": "review-read-only",
    "trial": 1,
    "variant": "candidate",
    "skill_snapshot": "受测 Skill 完整目录的内容摘要或提交及补丁摘要",
    "model": "供应商/精确模型版本",
    "harness": "运行时与版本",
    "settings": "发现模式；温度、上下文、预算及其他固定参数",
    "input_snapshot": "输入与其余 Skills/规则的固定快照摘要",
    "environment": "环境镜像或依赖锁定摘要",
    "tool_policy": "已确认的工具权限描述或配置摘要",
    "started_at": "2026-09-23T10:00:00Z",
    "transcript": "仓库外脱敏轨迹的路径或证据标识",
    "duration_ms": null,
    "total_tokens": null,
    "checks": [
      { "id": "route", "outcome": "not_run", "evidence": "示例字段，尚未运行" },
      { "id": "no-write", "outcome": "not_run", "evidence": "示例字段，尚未运行" },
      { "id": "finding", "outcome": "not_run", "evidence": "示例字段，尚未运行" }
    ]
  }]
}
```

- `variant` 为 `baseline` 或 `candidate`；新 Skill 的基线快照可为 `none`，候选不可为 `none`。
- 每个 `case_id + trial` 必须有两条成对记录；上述单条示例不能独立通过成对检查。可以只评测部分场景，但须明确未评测范围。
- `checks` 必须逐项对应场景定义，不得删掉失败检查；`outcome` 为 `pass`、`fail` 或 `not_run`，每项附定位证据或未运行原因。
- 耗时和 token 未知时写 `null`，不得填 0 冒充真实测量。trial 是重复次数标识，不是用于隐藏重试的最佳结果编号。

## 验证入口

```bash
node scripts/validate-skill-evals.mjs
node scripts/validate-skill-evals.mjs benchmarks/skill-behavior /absolute/path/to/runs.json
node --test tests/benchmarks/validate-skill-evals.test.mjs
```

第一条只校验场景结构；第二条额外校验记录完整性、成对关系和比较条件一致性。脚本不运行模型、不打开轨迹、不验证人工填写的事实、不计算质量结论。即使 `outcome` 全为 `fail` 或 `not_run`，格式合法的记录仍可通过结构检查。
