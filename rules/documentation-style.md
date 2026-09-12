# 文档约定

这些规则只适用于 Agent Kit 仓库。通用写作方法位于 `technical-documentation` Skill 的 `references/style.md`。

- 用户和 Agent 可见的说明使用中文；命令、路径、API 名称和专名保留原文。
- README 只描述已经存在的文件和行为，不为未来内容创建空目录。
- 命令默认从仓库根目录执行；例外情况要在代码块前说明工作目录。
- 表格中的 Skill、扩展和脚本必须能在仓库中找到。
- 不使用 AI 文本检测器作为质量门禁。链接、模板残留、重复段落和占位 README 由 `./scripts/check-docs.mjs` 检查。
- 安全限制在最接近操作的位置说明一次；索引文档通过链接引用，不复制整段警告。
