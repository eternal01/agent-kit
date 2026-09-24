# Pi Skill 行为回放

该评测针对 Pi 的**真实自动触发**：有 Skill 组显式加载仓库全部 16 个 Skill，无 Skill 组禁用全部 Skill。每个请求独立会话、同一模型、同一只读模拟仓库，交替执行；仅当 Pi 成功调用 `read` 读取相应 `SKILL.md` 才记为触发。不能根据回答中提到的 Skill 名称推断触发。

## 本地运行

先预览次数（不调用模型）：

```bash
node scripts/replay-skill-triggers.mjs
```

确认模型账号和调用费用后，从仓库根目录运行一轮小样本：

```bash
node scripts/replay-skill-triggers.mjs --live --model PROVIDER/MODEL --limit 2 --runs 1
```

正式运行：

```bash
node scripts/replay-skill-triggers.mjs --live --model PROVIDER/MODEL --runs 3
```

将 `PROVIDER/MODEL` 换成 `pi --list-models` 中可用的精确模型标识。正式运行默认 10 案例 × 3 次 × 两组，即 **60 次**模型调用；超时或失败也可能产生费用。可指定 `--out DIR`、`--cases FILE`、`--pi FILE`。工具不安装依赖、不修改模拟仓库；使用 `--tools read` 并关闭扩展、上下文文件和会话持久化。`--offline` 仅禁止 Pi 自动联网更新目录，**不会阻止模型 API 请求**。如需在不同版本/模型之间比较，保持同一案例、模型、次数和 Pi 配置。

默认结果在 `.skill-replay-results/`（已忽略，不要提交）。`runs.json` 包含完整模型回答，可能包含敏感信息；在可信环境运行、避免将真实凭据放进自定义案例/fixture。`meta.json` 保存模型和仓库提交，`summary.json` 给出成功读取期望 Skill 的比例、误触发数、基线污染和无效运行。只对所有运行完成的案例判定路由；两组都无法成功完成时标为 `invalid`，不得把请求失败当作未触发。`route_pass` 门槛为至少 2/3 成功触发且零禁用 Skill 加载；这不是内容质量通过。

## 人工审核产物

阅读 `runs.json` 中的有/无 Skill 回答，按下面准则在每个案例上对照打勾，记录纠正意见；不要仅根据是否出现“三档”或回答长短判断：

1. 回答满足请求和 README 中的保护项（权限、错误提示、可访问性、现有重试与日志）。
2. 最小路径有证据，未虚构现有代码、测试结果或不存在的组件。
3. 有实质取舍时比较最小化、折衷、长期路径；不可行的档次说明原因，不凑数。
4. 推荐基于明确目标和成本，说明适用边界、验证与回滚；规划不擅自改文件。
5. 相对无 Skill 组确有增益，且没有明显的冗长或路由竞争。

案例只是模拟背景，不含真实项目代码；它可以检验方案行为，**不能**证明编码修改正确或最小变更基准通过。真实代码任务另按 `benchmarks/minimal-change/` 的正确性与保护项门禁评估。若要核验用户实际使用时的触发，还需替换为脱敏的真实任务，并在可信仓库运行。
