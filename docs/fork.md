# Fork 维护说明

## 身份

- 项目名称为 AI Image Studio，技术名称为 `ai-image-studio`，从 v1.0.0 开始独立版本编号。
- 本仓库是 [CookSleep/gpt_image_playground](https://github.com/CookSleep/gpt_image_playground) 的 fork，远程是 [H3nryM4/ai-image-studio](https://github.com/H3nryM4/ai-image-studio)。
- 协议是 MIT。保留 `LICENSE`，以及代码和文档里对原项目的许可声明。

## 基线

- 分叉点是 `9a88541`，v0.7.17，2026-10-08。
- 不合并上游 `main`。未列出的功能、样式和上游网页改动，先问维护者再决定跟进手改。

## 已决定

### 独立存储空间

应用存储统一使用 `ai-image-studio` 标识，不读取、迁移或回退到旧项目的数据库及存储键，也不主动删除旧数据库和存储键。沿用现有数据结构、格式版本、备份解析和校验。

### 不要桌面客户端

不引入、不恢复上游 v0.8 的 Windows 客户端。包括 `src-tauri`、安装包、自绘标题栏、应用内更新、系统代理、数据目录、SQLite 与图片文件存储、由 Rust 发请求、MCP 服务。原因是维护者明确不要桌面端，而 v0.8.0 到 v0.8.4 混在同一条 `main` 上，不能整支合并。

### 不要 CLI 与 Skill

上游 v0.8.2 的 CLI `gpt-image-playground` 和随附 Skill，是给 Claude Code、Codex 等本机工具用的。它操作的是正在运行的 Windows 客户端：应用必须开着，生图、历史和设置才会进那个客户端。安装入口也在客户端的「设置 → Skill」。

所以它不是一条能单独搬进网页版的能力，随客户端一起拒绝。

### 去掉赞助和推广

已移除应用内赞助入口、赞助弹窗及其状态和触发逻辑，删除 README 中的商业推广与赞助支持区块，以及仓库内的推广预置文件。只删推广，不删功能，保留供应商接入、配置导入、用户已有数据、非商业链接和来源与许可声明。

## 上游核对

只记看到哪。某次核对里要长期遵守的结论，写回上面的「已决定」，不要写在这里。

上次核对：2026-11-03，上游 `4b46b292`（v0.8.4）。下次只看这颗提交之后：

```
git fetch https://github.com/CookSleep/gpt_image_playground.git main
git log --oneline 4b46b292..FETCH_HEAD
```

看完把结论补进「已决定」，再把上面的提交号改成最新。不要另开文件。

### 2026-11-03

`9a88541..4b46b292`，79 个提交、242 个文件。桌面客户端、CLI 和 Skill 整段不合并，已写入上面的决定。

