# 知识整理方法

## 检索

1. 先用主题词、同义词和具体问题搜索已有笔记。
2. 只读取最相关的少量对象；摘要不足时再读取全文。
3. 记录笔记状态、来源日期和关联对象，避免把过期资料当作当前事实。

## 整理

- 已有笔记能承载新内容时更新原对象，不创建同义副本。
- 新内容改变旧结论时保留变化原因和日期，不静默改写历史。
- 一个笔记只维护一个主要问题；大型主题用对象关系连接，而不是无限加长正文。
- 来源列表保留标题、URL、日期和访问日期。

## Anytype 最小属性

可使用现有 Page 类型，并按需要增加：

- `knowledge_kind`：quick-note、learning-guide、source-note、comparison、reflection
- `knowledge_status`：inbox、learning、evergreen、revisit、archived
- `topics`：主题标签
- `source_url`、`source_date`
- `review_after`
- `confidence`：high、medium、low
- `related_notes`：Objects 关系

属性是导航手段，不要求一次建齐。只有用户明确要求时才创建属性、关系或对象。

## 复习

优先选择到期、基础性强且能解除后续学习阻塞的内容。一次推荐 3～5 篇，并说明顺序依据；不要把整个知识库变成阅读清单。
