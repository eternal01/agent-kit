# Pi Extensions

本目录保存依赖 Pi SDK 或 Pi 运行时约定的适配代码，不属于跨 Agent 通用能力。运行状态、API Key 和其他私密配置不得进入仓库。

## Anytype

`anytype/` 注册以下工具：

- `anytype_search`：全局或指定 Space 搜索
- `anytype_list_spaces` / `anytype_get_space`：读取可访问 Space
- `anytype_create_space` / `anytype_update_space`：管理 Space
- `anytype_list_objects_in_space`：分页读取 Space 对象
- `anytype_list_members` / `anytype_get_member`：读取 Space 成员和权限状态
- `anytype_list_types` / `anytype_get_type`：读取对象类型定义
- `anytype_list_templates` / `anytype_get_template`：读取类型模板
- `anytype_list_tags` / `anytype_get_tag`：读取属性标签
- `anytype_create_tag` / `anytype_delete_tag`：管理 select/multi_select 标签
- `anytype_get`：读取对象及分段 Markdown；属性超过 100 项时会标记 `properties_truncated`
- `anytype_create`：创建对象
- `anytype_update`：更新对象；`markdown` 为完整正文替换
- `anytype_archive`：归档对象（Anytype API 的删除操作）
- `anytype_list_properties`：列出 Space 属性
- `anytype_create_property` / `anytype_update_property` / `anytype_delete_property`：管理用户自定义属性
- `anytype_get_property`：读取属性定义
- `anytype_set_object_relation`：设置用户自定义 Objects 原生关系，生成可点击的关系对象
- `anytype_list_views`：读取 Collection/List 的视图
- `anytype_list_objects`：读取 Collection/List 中的对象
- `anytype_add_objects_to_list`：将对象加入 Collection/List
- `anytype_remove_object_from_list`：从 Collection/List 移除对象

默认面向“Pi 在 macOS Docker 容器、Anytype 在宿主机”的环境：

```bash
export ANYTYPE_BASE_URL=http://host.docker.internal:31010
export ANYTYPE_HOST_HEADER=localhost:31010
export ANYTYPE_API_VERSION=2025-11-08
export ANYTYPE_API_KEY='通过 Anytype Settings > API Keys 创建的 Key'
export ANYTYPE_DEFAULT_SPACE_ID='可选的默认 Space ID'
```

不要将 API Key 写入镜像或仓库；优先使用容器 secret 或运行时环境变量。默认只允许访问回环地址和 `host.docker.internal`。连接远程 Anytype API 时必须使用 HTTPS，并显式设置 `ANYTYPE_ALLOW_REMOTE=1`。

安装扩展：

```bash
./scripts/link-pi-extensions.sh
```

测试单个扩展：

```bash
cd adapters/pi/extensions/anytype && npm run verify
pi -e ./adapters/pi/extensions/anytype/index.ts
```

Anytype 扩展的配置校验会拒绝未显式允许的远程 HTTP 地址；远程服务必须使用 HTTPS 并设置 `ANYTYPE_ALLOW_REMOTE=1`。

修改链接安装的扩展后，在 Pi 中运行 `/reload` 即可重新加载。

## GitHub Research

`github-research/` 注册只读的 `github_research` 工具，支持跨仓库 Repository、Code、Issue 和 PR 检索、批量查询、分页去重、候选仓库证据采集与可解释成熟度评分。GitHub 内容始终按不可信外部证据处理。

运行环境诊断：

```text
/github-research-doctor
```

该命令只检查 `gh` 版本、github.com 认证状态和 Core/Search API 剩余额度，不输出 Token。扩展详情和评分方法见 [`github-research/README.md`](extensions/github-research/README.md)。

统一验证：

```bash
./scripts/verify-pi-extensions.sh
./scripts/verify-pi-extensions.sh --live
```

## 知识库组织

Anytype 的系统属性 `links` / `backlinks` 不能通过 API 直接写入。推荐先在 Anytype 客户端创建 Collection/List，再使用扩展维护成员：

1. 使用 `anytype_search` 找到目标 Page ID。
2. 使用 `anytype_list_views` 获取 Collection/List 的 `list_id` 和 `view_id`。
3. 使用 `anytype_add_objects_to_list` 将 Page 加入 List。
4. 使用 `anytype_list_objects` 验证成员。
5. 需要对象间语义关系时，使用 `anytype_create_property` 创建 `format: objects` 的自定义属性。
6. 使用 `anytype_set_object_relation` 设置该自定义属性，Anytype 会显示原生可点击关系对象。
7. 也可以使用 `anytype_update` 设置该自定义属性的 `objects` 值。

不要使用 `anytype://object/...` Markdown 链接代替 Anytype 原生关系；它不会被 API Markdown 正确解析为内部对象链接。

## API 边界

当前 Anytype API（`2025-11-08`）还包含聊天、文件上传/下载和二进制资源接口。它们不纳入当前知识库扩展：聊天需要流式响应和消息状态管理，文件需要 multipart/二进制传输，且二者与知识库对象导航无直接关系。页面内部嵌入式 Collection Block 也没有独立的公开 Block CRUD 端点；扩展只能管理可通过 `/lists/{list_id}` 暴露的顶层 Collection/List。

官方文档：<https://developers.anytype.io/docs/reference>

