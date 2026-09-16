# 最小充分变更评测

本目录评估最小充分变更规则是否在不降低正确性和保护项的前提下，减少无必要的依赖、接口、状态、文件和代码。场景定义在 [cases.json](cases.json)，判定方法见 [rubric.md](rubric.md)。

运行结构校验：

```bash
./scripts/validate-minimal-change-benchmarks.mjs
```

该命令只验证场景结构，不调用模型。真实对照运行需要由执行者准备受测仓库、模型和验证命令；结果不得用未通过的正确性或安全门禁换取更低的复杂度指标。
