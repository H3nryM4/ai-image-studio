<div align="center">

# 🎨 AI Image Studio

本项目是 [CookSleep/GPT Image Playground](https://github.com/CookSleep/gpt_image_playground) 的 fork，由 [@H3nryM4](https://github.com/H3nryM4) 维护，遵循 MIT 许可。

[![GitHub Repo stars](https://img.shields.io/github/stars/H3nryM4/ai-image-studio?style=flat-square&color=eab308)](https://github.com/H3nryM4/ai-image-studio/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/H3nryM4/ai-image-studio?style=flat-square&color=3b82f6)](https://github.com/H3nryM4/ai-image-studio/network/members)
[![License](https://img.shields.io/badge/license-MIT-10b981?style=flat-square)](LICENSE)
[![React](https://img.shields.io/badge/React-19-20232A?style=flat-square&logo=react&logoColor=61DAFB)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

**支持 GPT Image、Gemini 和 Grok 的图片生成与编辑工具**

提供简洁精美的 Web UI，支持 OpenAI Images API、Gemini generateContent、Grok Images API 与自定义 HTTP 接口。<br>
支持文本生图、参考图、画板标注与遮罩编辑，数据纯本地化存储，带来流畅的历史记录与参数管理体验。

<br>

[![Vercel 上游在线体验](https://img.shields.io/badge/Vercel-%E4%B8%8A%E6%B8%B8%E5%9C%A8%E7%BA%BF%E4%BD%93%E9%AA%8C-black?style=for-the-badge&logo=vercel&logoColor=white)](https://gpt-image-playground.cooksleep.dev)
&nbsp;&nbsp;&nbsp;
[![GitHub Pages 上游在线体验](https://img.shields.io/badge/GitHub%20Pages-%E4%B8%8A%E6%B8%B8%E5%9C%A8%E7%BA%BF%E4%BD%93%E9%AA%8C-222222?style=for-the-badge&logo=github&logoColor=white)](https://cooksleep.github.io/gpt_image_playground)

</div>

<br>

> 💡 **提示**：若需调用非 HTTPS 的内网或本地 HTTP API，请使用上游 GitHub Pages 版本或自行部署，上游 Vercel 体验版绑定的 `.dev` 域名因安全策略通常要求接口必须为 HTTPS。

> **v1.0.0 存储说明**：AI Image Studio 使用独立的本地存储空间，首次打开从初始状态开始，不读取或迁移旧项目的历史、图片及设置。旧数据库和存储键不会被主动删除，备份导入功能继续沿用现有解析方式。

---

## 📸 界面预览

<details>
<summary><b>点击展开截图展示</b></summary>
<br>

<div align="center">
  <b>桌面端主界面</b><br>
  <img src="docs/images/example_pc_1.jpg" alt="桌面端主界面" />
</div>

<br>

<div align="center">
  <b>任务详情与实际参数</b><br>
  <img src="docs/images/example_pc_2.jpg" alt="任务详情与实际参数" />
</div>

<br>

<div align="center">
  <b>桌面端批量选择</b><br>
  <img src="docs/images/example_pc_3.jpg" alt="桌面端批量选择" />
</div>

<br>

<div align="center">
  <b>移动端主界面</b><br>
  <img src="docs/images/example_mb_1.jpg" alt="移动端主界面" width="420" />
</div>

<br>

<div align="center">
  <b>移动端侧滑多选</b><br>
  <img src="docs/images/example_mb_2.jpg" alt="移动端侧滑多选" width="420" />
</div>

</details>

---

## ✨ 核心特性

### 🎨 强大的图像生成与编辑
- **参考图与遮罩**：支持上传最多 16 张参考图（支持剪贴板和拖拽）。内置可视化遮罩编辑器，自动预处理以符合官方分辨率限制。
- **画板标注**：可在空白画布或参考图上用画笔、文字、图形和像素橡皮擦标注修改意图，完成后作为参考图使用；画板与遮罩编辑器均支持缩放平移（Alt / Ctrl + 滚轮、Alt + 拖动、双指捏合）。
- **评论标注**：在画板中用评论工具点击图片添加评论，评论以“图N 评论”胶囊插入提示词，发送时自动附上每条评论在图中的位置（如 `(X=52%, Y=41%)`），复用任务时可恢复评论。
- **批量与迭代**：支持单次多图生成；一键将满意结果转为参考图，无缝开启下一轮修改。
- **多提示词批量提交**：在“设置 - 习惯配置”中开启后，可一次粘贴多条提示词批量生成。提示词之间空两行分隔（评论等单个空行仍属于同一条提示词），参考图和参数对每条提示词都生效；支持排队或并发执行，并发数默认限制为 10，进行中可查看进度并随时停止。
- **流式生成预览**：`Images API` 支持流式接收中间步骤图像，缓解连接超时问题。
- **GPT Image 2.6**：支持复杂度、SVG 和 GIF 输出；GIF 可设置帧数和每帧时长。SVG 编写模型可在 API 配置中单独填写，留空使用接口默认值；具体能力以所选模型和渠道支持为准。
- **透明背景（API 原生 / 本地后处理双模式）**：画廊模式下选择 PNG 或 WebP 格式后可开启透明背景功能，每个 API 配置可独立选择实现方式（设置入口在 API 配置页）。API 原生模式会直接请求模型返回透明通道（需当前接口和模型支持），本地后处理模式则会要求模型使用纯绿色或纯洋红色背景，并在结果返回后于浏览器中去除背景色，按所选 PNG 或 WebP 格式保存透明结果。

  > 本地后处理流程适用于图标、贴纸、单主体素材等场景；若主体边缘存在复杂发丝、半透明材质、强反光或与背景色接近的颜色，可能出现边缘残留或误抠。若使用 API 原生模式时接口返回“不支持透明背景”类错误，应用会提示切换为本地后处理。

### ⚙️ 精细化参数追踪
- **智能尺寸控制**：提供 1K/2K/4K 快速预设，自定义宽高时会自动规整至模型安全范围（16 的倍数、总像素校验等）。
- **实际参数对比**：自动提取 API 响应中真实生效的尺寸、质量、耗时以及**模型改写后的提示词**，与你的请求参数高亮对比。支持定制化的参数列表横向平滑滚动体验。

### 📁 高效历史管理 (纯本地)
- **瀑布流与画廊**：历史任务自动保存，支持按状态过滤、全屏大图预览与快捷下载。
- **多收藏夹管理**：支持创建多个命名收藏夹，同一任务可归入多个收藏夹。提供独立的收藏夹概览视图（展示封面缩略图与任务数量），点击进入具体收藏夹后仍可叠加搜索与状态筛选。收藏夹支持拖拽排序、重命名、设置默认收藏夹，以及按收藏夹为单位批量打包下载 ZIP。
- **失败任务重试**：可在“设置 - 习惯配置”的“重试方式”中选择重试时新建任务，或覆盖失败任务及任何任务；覆盖时保留原任务的创建时间和收藏，耗时从本次重试重新计算。
- **快捷批量操作**：桌面端支持鼠标拖拽框选、Ctrl/⌘ 连选，移动端支持顺滑侧滑多选；轻松实现批量收藏与清理。
- **优化的图片查看与下载**：大图预览支持左右滑动切换、移动端长按弹出操作菜单，支持快捷下载与批量下载。
- **极致性能与隐私**：所有记录与图片均存放在浏览器 IndexedDB 中（采用 SHA-256 去重压缩），不经过任何第三方服务器。支持一键打包导出 ZIP 备份。

### 🔌 多配置与供应商增强
- **多配置管理**：支持创建并保存多个 API 配置（包含供应商、API Key、模型等），按需快速切换；支持一键复制当前配置到列表底部，并通过拖拽对配置列表与供应商列表进行自定义排序。
- **多模型切换**：配置的模型 ID 可用逗号分隔填写多个模型（如 `gpt-image-2.5-sunburst, gpt-image-2`），在首页参数栏的“模型”中切换，选择按配置分别记住；预置配置、URL 传参与导入导出均支持这种写法。
- **多种 API 接入**：在 API 配置的「接入方式」中统一选择以下接口。
  - **OpenAI Images API**：通过图片接口生成图片，支持官方及兼容接口。
  - **Gemini generateContent**：支持文生图、参考图编辑、宽高比、分辨率与按模型支持的思考强度选择。多图按次数请求，每个任务最多两个请求并发；透明背景使用本地去背景。暂不支持蒙版编辑。
  - **Grok Images API**：支持 xAI 官方协议及相应兼容接口的文生图和参考图编辑，最多 5 张参考图、单次最多生成 10 张。可设置宽高比、1K/2K 分辨率，以及支持模型的质量；透明背景使用本地去背景，暂不支持蒙版编辑。
  - **自定义 HTTP 接口**：通过 JSON 定义请求和结果映射，支持 JSON 或 multipart 请求、同步返回或异步轮询，以及图片 URL 或 Base64 结果。
- **API 代理**：内置接入和同步自定义接口可开启同源 `/api-proxy/` 代理，交由 Docker 或本地开发环境转发至真实 API，绕开浏览器 CORS 限制。部署端需配置对应协议的目标地址。
- **Codex CLI 兼容模式**：对上游为 Codex CLI 的 API，开启后应用 Codex CLI 实际支持的参数，并将多图生成拆分为并发单图。
- **提示词约束**：Codex CLI 兼容模式可在请求文本中要求保留原提示词，是否遵循取决于模型。
- **习惯配置**：支持设置提交后清空输入、重启后保留历史输入、临时复用历史任务 API 配置、重试方式、关闭提示词防改写等。

---

## 🚀 部署与使用

支持多种部署与开发方式。

<a id="preset-config"></a>
### 预置配置说明

所有部署方式都可以通过环境变量提供“预置配置”——部署端预先加入用户配置列表的 API 配置。用户打开页面时会自动看到这些配置，无需手动创建，格式和用户自己创建的配置完全一致。

环境变量的值支持三种填写方式：

| 填写方式 | 说明 | 示例 |
|------|------|------|
| **直接填写 API 地址** | 自动创建一个 OpenAI 兼容的默认预置配置（ID 为 `default-openai`）并注入 API URL，其余参数（模型、超时等）使用应用默认值，用户只需补充 API Key。末尾带 `/` 时直接拼接接口，不补 `/v1` 前缀。适合只提供一个配置的部署。后续如需通过 JSON 或链接更新此配置，指定 `id` 为 `default-openai` 即可。 | `https://api.openai.com/v1` |
| **API 地址 + 查询参数** | 在地址后追加参数，可同时预填 Key、模型等字段。 | `https://api.openai.com/v1?model=gpt-image-2.5-sunburst&connectionId=openai-images` |
| **JSON 配置文件 / 导入链接** | 通过仓库内或本地的 JSON 文件路径（如 `./config.json`）、远程 URL 或含 `?settings=` 参数的导入链接提供完整预置配置，支持预置多个内置接入或自定义 HTTP 配置。 | 详见 [预置配置 JSON 格式](#preset-config-json) |

**环境变量一览**

部署时可以通过设置环境变量来控制预置配置和客户端行为。有关 Docker 专属的网络与代理配置（如 `ENABLE_API_PROXY` 等），请参考下方的 [Docker 部署](#docker-deployment) 章节。

| 构建时变量 (Vercel/CF/本地) | Docker 运行变量 | 功能说明 |
|------|------|------|
| `VITE_DEFAULT_API_URL` | `DEFAULT_API_URL` | 设定预置配置值（支持 URL 形式或 JSON 格式，详见 [预置配置 JSON 格式](#preset-config-json)） |
| `VITE_LOCK_PRESET_CONFIG_PARAMS=true` | `LOCK_PRESET_CONFIG_PARAMS=true` | 锁定预置配置中除 API Key 外的参数，并禁止编辑预置供应商定义；当前锁定配置引用的供应商不可删除，解除引用后可删除 |
| `VITE_PREVENT_PRESET_CONFIG_DELETION=true` | `PREVENT_PRESET_CONFIG_DELETION=true` | 禁止删除预置配置和预置供应商，不锁定参数；普通项不受影响 |
| `VITE_SHOW_PRESET_CONFIG_ONLY=true` | `SHOW_PRESET_CONFIG_ONLY=true` | 只允许使用当前预置配置，禁止创建、复制、删除、拖动、切换供应商和管理自定义供应商；未同时开启锁定时参数仍可编辑，API Key 始终可编辑 |

> **未开启上述限制时的默认行为**：
> - **参数更新**：API 地址、模型、超时等参数会与上一次部署快照比较；部署值发生变化时覆盖一次本地值，之后保留用户的本地修改，直到部署值再次变更。
> - **API Key**：始终由用户在本地管理，重新部署不覆盖。
> - **排序与删除**：预置配置可拖动；预置配置和预置供应商均允许删除，删除状态保存在浏览器中，重新部署不会恢复。
> - **下线预置清理**：部署端移除某个预置后，若用户从未修改过该配置且没有历史生成任务引用，会自动从本地删除；若已被修改或仍被历史任务引用，则保留并转为普通配置。
> - **失效供应商清理**：随预置引入的自定义供应商在不再被任何配置使用、且从未被用户修改时，也会自动清理。

> 兼容提示：旧变量 `VITE_SHOW_DEFAULT_CONFIG_ONLY`／`SHOW_DEFAULT_CONFIG_ONLY` 仍可使用，等同于对应的 `SHOW_PRESET_CONFIG_ONLY`。

### 部署方式

<details>
<summary><strong>▲ 方式一：Vercel 一键部署 (推荐)</strong></summary>

支持通过 Vercel 一键导入 GitHub 仓库并自动完成构建部署。

**预置配置**

在 Vercel 项目的 **Settings → Environment Variables** 中设置 `VITE_DEFAULT_API_URL`，支持上述三种填写方式，可直接填写 API 地址或指定配置文件路径（如仓库内的 [`gpt-image-config.example.json`](gpt-image-config.example.json) 模板）。详见 [预置配置说明](#preset-config)。

```dotenv
VITE_DEFAULT_API_URL=https://api.openai.com/v1
```

**初始部署**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FH3nryM4%2Fai-image-studio&project-name=ai-image-studio&repository-name=ai-image-studio)

点击上方按钮导入仓库即可，Vercel 会自动执行构建并部署静态文件。添加或修改环境变量后需要重新部署。

**绑定自定义域名 (国内直连)**：Vercel 默认分配的 `.vercel.app` 域名在国内通常无法直接访问。如果你希望在国内直连访问，请在 Vercel 项目的 **Settings → Domains** 中绑定你自己的域名。

**更新方式**

本项目已在 `vercel.json` 中关闭了默认的自动部署。若你 Fork 了本仓库，建议配置 Deploy Hook 以实现新版本自动构建：

1. 在 Vercel 项目的 **Settings → Git → Deploy Hooks** 中创建一个名为 `Release` 的 Hook（Branch 填 `main`）并复制生成的 URL。
2. 在你 Fork 的 GitHub 仓库 **Settings → Secrets and variables → Actions** 中，新建 Secret `VERCEL_DEPLOY_HOOK`，填入刚才的 URL。

配置完成后：
- **自动更新**：推送 `v*` 标签会触发部署；向 `main` 推送版本号变更时，只有当前仓库已存在对应版本的 Release 才会触发 Vercel 构建部署。日常普通代码提交不会触发部署。
- **手动触发**：若需立即部署最新代码（包括未发布正式版本的日常提交），可进入仓库顶部的 **Actions** 标签页，在左侧选择 **Deploy to Vercel**，点击右侧的 **Run workflow** 下拉按钮（分支选择 `main`），点击绿色的 **Run workflow** 按钮即可手动部署。

</details>

<details>
<summary><strong>🌐 方式二：GitHub Pages 部署</strong></summary>

支持通过 GitHub Actions 工作流将静态页面发布至 GitHub Pages。

**预置配置**

在仓库 **Settings → Secrets and variables → Actions** 中添加 Secret `VITE_DEFAULT_API_URL`，支持上述三种填写方式，可直接填写 API 地址或指定配置文件路径（如仓库内的 [`gpt-image-config.example.json`](gpt-image-config.example.json) 模板）。详见 [预置配置说明](#preset-config)。

```dotenv
VITE_DEFAULT_API_URL=https://api.openai.com/v1
```

**初始部署**

1. 在 GitHub 仓库的 **Settings → Pages** 中，将 **Build and deployment → Source** 设置为 **GitHub Actions**。
2. 进入仓库顶部的 **Actions** 标签页，在左侧选择 **Deploy to GitHub Pages**，点击右侧的 **Run workflow** 下拉按钮（分支选择 `main`），点击绿色的 **Run workflow** 按钮完成首次构建部署。

**更新方式**

- **自动更新**：推送 `v*` 标签会触发部署；向 `main` 推送版本号变更时，只有当前仓库已存在对应版本的 Release 才会触发 GitHub Pages 构建部署。日常普通代码提交不会触发部署。
- **手动触发**：若需立即部署最新代码（包括未发布正式版本的日常提交），可进入仓库顶部的 **Actions** 标签页，在左侧选择 **Deploy to GitHub Pages**，点击右侧的 **Run workflow** 下拉按钮（分支选择 `main`），点击绿色的 **Run workflow** 按钮即可手动部署。

</details>

<details>
<summary><strong>☁️ 方式三：Cloudflare Workers 部署</strong></summary>

支持通过内置的 Wrangler 配置将构建产物作为静态资源部署至 Cloudflare Workers。

**预置配置**

在执行构建前设置环境变量 `VITE_DEFAULT_API_URL`，支持上述三种填写方式，可直接填写 API 地址或指定配置文件路径（如仓库内的 [`gpt-image-config.example.json`](gpt-image-config.example.json) 模板）。Cloudflare Workers 不会在部署后改写静态文件，因此必须在构建前完成设置。详见 [预置配置说明](#preset-config)。

```dotenv
VITE_DEFAULT_API_URL=https://api.openai.com/v1
```

**部署**

**1. 登录 Cloudflare**

```bash
npx wrangler login
```

**2. 部署到 Workers**

```bash
npm run deploy:cf
```

部署脚本会先执行 `npm run build`，再通过 `wrangler deploy` 上传 `dist/` 目录，默认 Worker 名称为 `ai-image-studio`。如之前使用旧名称部署，原服务和域名绑定需另行迁移。

</details>

<a id="docker-deployment"></a>
<details>
<summary><strong>🐳 方式四：Docker 部署</strong></summary>

支持通过本仓库发布的 Docker 镜像在服务器或本地容器环境中快速运行。镜像由 GitHub Actions 发布；首次发布前也可在仓库根目录自行构建：

```bash
docker build -f deploy/Dockerfile -t ghcr.io/h3nrym4/ai-image-studio:latest .
```

**环境变量**

| 变量 | 说明 |
|------|------|
| `DEFAULT_API_URL` | 预置配置，支持上述三种填写方式。若值指向 `.json` 文件或容器内路径，容器启动时自动读取并内嵌到页面。宿主机文件需通过 volume 挂载。详见 [预置配置说明](#preset-config) |
| `ENABLE_API_PROXY=true` | 开启 Nginx 同源代理，请求发往 `/api-proxy/{路径}` 再转发到 `API_PROXY_URL` |
| `API_PROXY_URL` | 代理转发的完整 API 基础地址（不自动补 `/v1`） |
| `LOCK_API_PROXY=true` | 强制锁定代理为开启，用户无法关闭 |
| `HOST` / `PORT` | Nginx 监听地址和端口，默认 `0.0.0.0:80` |

> 开启 API 代理后，任何人都能将你的服务器作为代理来请求目标 API。建议仅在有访问控制（如 IP 白名单）或本地网络中开启。

> 旧版 `API_URL` 已拆分为 `DEFAULT_API_URL` 和 `API_PROXY_URL`，容器启动时自动兼容，无需立即修改。

**隐藏真实 API 地址**

配合 `ENABLE_API_PROXY=true` + `LOCK_API_PROXY=true` 可隐藏上游地址：

- OpenAI 兼容接口：`DEFAULT_API_URL` 留空或填占位地址（如 `https://proxy`）。
- 自定义供应商：JSON 中配置的 `baseUrl` 留空并设置 `apiProxy: true`（仅支持同步配置）。

用户只能看到空值或占位地址，真实地址仅存在于 `API_PROXY_URL`。

**Docker CLI 示例**

```bash
docker run -d -p 8080:80 \
  -e DEFAULT_API_URL=https://api.openai.com/v1 \
  ghcr.io/h3nrym4/ai-image-studio:latest
```

开启代理并隐藏真实地址：

```bash
docker run -d -p 8080:80 \
  -e DEFAULT_API_URL= \
  -e API_PROXY_URL=https://real-api.example.com/v1 \
  -e ENABLE_API_PROXY=true \
  -e LOCK_API_PROXY=true \
  ghcr.io/h3nrym4/ai-image-studio:latest
```

挂载本地配置文件：

```bash
docker run -d -p 8080:80 \
  -v ./gpt-image-config.json:/config/gpt-image-config.json:ro \
  -e DEFAULT_API_URL=/config/gpt-image-config.json \
  ghcr.io/h3nrym4/ai-image-studio:latest
```

使用 host 网络加 `--network host`，修改端口用 `-e PORT=28080`。

**Docker Compose 示例**

```yaml
services:
  ai-image-studio:
    image: ghcr.io/h3nrym4/ai-image-studio:latest
    environment:
      - DEFAULT_API_URL=https://api.openai.com/v1
    ports:
      - "8080:80"
    restart: unless-stopped
```
**更新说明：**

使用 `latest` 标签时，重新拉取镜像并重启即可更新（如 `docker compose pull && docker compose up -d`）。若需固定版本可使用本仓库发布的版本号标签（如 `1.0.0`）。

</details>

<details>
<summary><strong>💻 方式五：本地开发与静态构建</strong></summary>

支持在本地通过 Node.js 环境运行开发服务器或构建生产静态文件。

**1. 预置配置（可选）**

在项目根目录新建 `.env.local` 文件，设置 `VITE_DEFAULT_API_URL`，支持上述三种填写方式，可直接填写 API 地址或指定配置文件路径（如仓库内的 [`gpt-image-config.example.json`](gpt-image-config.example.json) 模板）。详见 [预置配置说明](#preset-config)。

开发服务器启动或构建时若值指向远程 `.json` 文件或本地路径，内容会自动内嵌到页面。

```dotenv
VITE_DEFAULT_API_URL=https://api.openai.com/v1
```

**2. 安装依赖并启动**

```bash
npm install
npm run dev
```

**3. 本地开发跨域代理 (可选)**

如果在本地开发时遇到浏览器的 CORS 限制，可开启本地代理转发：

```bash
cp dev-proxy.config.example.json dev-proxy.config.json
```

修改 `dev-proxy.config.json`，将 `target` 设置为真实的完整 API 基础地址。代理不会自动补 `/v1`，OpenAI 兼容接口通常必须填写到版本前缀，如 `https://api.example.com/v1`。重启开发服务器后，在页面设置中开启 **API 代理** 即可（请求将被转发如 `http://localhost:5173/api-proxy/... -> target/...`）。此功能仅在 `npm run dev` 阶段生效，不会影响打包产物。

**4. 本地故障模拟 API (可选)**

如果需要复现图片 URL 跨域、接口返回结构异常、原始响应查看等问题，可启动内置模拟服务：

```powershell
npm run mock:api
```

使用方式见 [本地故障模拟 API](docs/mock-image-api.md)。

**5. 构建静态产物**

```bash
npm run build
```

构建输出的文件位于 `dist/` 目录下，可将其部署至任何静态文件服务器（如普通 Nginx、GitHub Pages、Netlify 等）。

</details>

---

<a id="url-quick-fill"></a>
## 🛠️ 配置分享与导入

在 **设置 → API 配置 → 配置管理 → 配置下拉列表 → 对应配置的分享按钮** 中复制完整配置链接，或复制配置 JSON、导出 JSON 文件。分享默认不包含 API Key，接收方可在导入预览中填写。

打开分享链接会先显示配置预览，确认后才保存和切换。默认添加为新配置；连接相同的配置可以选择复用，也可以明确选择覆盖某个已有配置。自定义服务商定义随配置一起导入，同 ID 的不同服务商会另存，不会自动覆盖本地定义。

在 **配置管理 → 添加配置 → 导入配置** 中可以粘贴分享链接、配置 JSON，或选择 JSON 文件。新分享链接使用 `#config=` 承载配置；`?settings=` 和下面的查询参数链接也可导入，也会先显示预览。仅展示预置配置的部署只允许更新匹配预置配置中允许修改的字段。

### 查询参数

以下参数用于查询参数链接与外部集成。

| 参数 | 说明 | 示例 |
|------|------|------|
| `apiUrl` | API Base URL | `?apiUrl=https://api.example.com/v1` |
| `apiKey` | API Key | `?apiKey=sk-xxxx` |
| `model` | 模型 ID，多个模型以逗号分隔，可在首页切换 | `?model=gpt-image-2.5-sunburst,gpt-image-2` |
| `connectionId` | 接入标识，默认 `openai-images`；也支持 `gemini-generate-content`、`xai-images` 或自定义接口 ID | `?connectionId=xai-images` |
| `profileName` | 配置名称，默认“URL 参数配置” | `?profileName=我的配置` |
| `codexCli` | Codex CLI 兼容模式 | `?codexCli=true` |
| `streamImages` | 流式传输 | `?streamImages=true` |
| `streamPartialImages` | 中间步骤图像数（需配合 streamImages） | `?streamPartialImages=2` |
| `profileId` | 链接的目标配置 ID，用于解析预览；普通导入仍需明确选择是否覆盖 | `?profileId=my-service` |
| `transparentBackgroundMethod` | 透明背景实现方式：`api`（原生）或 `local`（本地后处理） | `?transparentBackgroundMethod=local` |

<a id="preset-config-json"></a>
## 📋 预置配置 JSON 格式

使用 JSON 文件或分享链接提供预置配置时，JSON 对象支持以下顶层字段：

- **`customConnections`**（可选数组）：自定义 HTTP 接口定义。只使用内置的 OpenAI、Gemini 或 Grok 接入时可省略。
- **`profiles`**（数组）：预置的 API 配置列表。每项对应用户配置页中的一个配置条目。

### 配置列表字段说明（`profiles`）

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 部署预置时填写 | 标识部署预置配置，供后续部署同步和链接定位。普通分享会省略此字段；手动导入默认新建，不会因为 ID 相同而直接覆盖本地配置。 |
| `name` | 是 | 配置名称，方便用户识别。 |
| `description` | 否 | 配置说明，支持 Markdown；显示在配置详情中，可展开查看。文本可选中和复制，其中的链接可点击。 |
| `connectionId` | 是 | 接入标识。`"openai-images"` 选择 OpenAI Images 协议，`"gemini-generate-content"` 选择 Gemini 协议，`"xai-images"` 选择 Grok 协议，均支持相应兼容接口；其他值引用 `customConnections` 中具有相同 ID 的接口定义。 |
| `baseUrl` | 是 | API 基础地址（Base URL）。未以 `/` 结尾时自动补齐 `/v1`，Gemini 则补 `/v1beta`；以 `/` 结尾时直接基于该地址请求接口，不补版本。 |
| `apiKey` | 否 | API Key。建议省略，让用户导入后自行填写。 |
| `model` | 是 | 模型 ID。多个模型以逗号分隔，默认使用第一个，用户可在首页切换。 |
| `svgModel` | 否 | OpenAI Images 接入输出 SVG 时的编写模型 ID。留空使用接口默认值，仅在渠道要求指定时填写。 |
| `isDefault` | 否 | 有多个配置时，为默认项设置 `true`（只能有一个）；只有一个配置时不填。默认项决定首次使用时自动选中的配置；允许拖动排序和删除（受保护策略控制）。 |
| `timeout` | 否 | 请求超时秒数，默认 600。 |
| `apiProxy` | 否 | 是否走部署端 API 代理，默认 `false`。 |
| `transparentBackgroundMethod` | 否 | 透明背景实现方式：`"api"`（API 原生）或 `"local"`（本地后处理）。OpenAI 兼容配置默认 `"api"`，Gemini 和 Grok 固定为 `"local"`。自定义服务商若生成和编辑请求都映射了 `$params.background` 模板变量则默认 `"api"`，否则默认 `"local"`。 |

### 示例：仅 OpenAI 兼容

```json
{
  "profiles": [
    {
      "id": "my-openai",
      "name": "我的 OpenAI 配置",
      "description": "使用前请阅读 [接口说明](https://example.com/docs)。",
      "connectionId": "openai-images",
      "baseUrl": "https://api.openai.com/v1",
      "model": "gpt-image-2.5-sunburst"
    }
  ]
}
```

### 如何将预置配置提供给环境变量

预置配置 JSON 可以通过以下三种方式填入部署环境变量（`VITE_DEFAULT_API_URL` 或 Docker 的 `DEFAULT_API_URL`）：

**1. 查询参数导入链接**

使用当前 JSON 结构生成的 `?settings=` 链接可填入环境变量。新版应用内分享使用 `#config=` 链接，供用户预览导入；配置部署环境变量时，请从分享弹窗导出 JSON，再使用下方的文件方式。

> 💡 **提示**：分享导出包含当前选中的单个配置及其关联的自定义供应商。如需一次性预置包含多个服务商的列表，请使用下方的本地/仓库文件或远程 URL 方式。

```dotenv
VITE_DEFAULT_API_URL=https://你的域名?settings=%7B%22profiles%22%3A%5B...%5D%7D
```

**2. 仓库内／本地配置文件（推荐）**

支持直接指定仓库根目录或本地文件相对路径（如 `./gpt-image-config.example.json` 或 `./config/my-presets.json`），构建时会自动读取并内嵌到静态页面中。

```dotenv
VITE_DEFAULT_API_URL=./gpt-image-config.example.json
```

Docker 需要通过 volume 挂载宿主机文件到容器内路径：

```bash
docker run -d -p 8080:80 \
  -v ./gpt-image-config.json:/config/gpt-image-config.json:ro \
  -e DEFAULT_API_URL=/config/gpt-image-config.json \
  ghcr.io/h3nrym4/ai-image-studio:latest
```

> Docker 环境变量名为 `DEFAULT_API_URL`（不含 `VITE_` 前缀）。

**3. HTTP／HTTPS 远程配置文件**

将 JSON 保存到部署服务器能够访问的 URL（可位于内网，不要求用户浏览器能访问）。构建时或容器启动时会自动读取并内嵌到页面。

```dotenv
VITE_DEFAULT_API_URL=https://example.com/gpt-image-config.json
```

---

<a id="custom-connection-config"></a>
## 🔌 自定义供应商

当 API 与内置的 OpenAI、Gemini、Grok 协议不一致时，需要在 `customConnections` 中定义请求和响应结构。每个接口定义必须有唯一的 `id`，不能使用内置标识 `openai-images`、`gemini-generate-content` 或 `xai-images`，然后由 `profiles` 中配置的 `connectionId` 字段引用。

若自定义供应商的接口不在 `/v1` 路径下，请将配置中的 `baseUrl` 设置为以 `/` 结尾。例如 `baseUrl` 为 `https://api.example.com/` 且 `submit.path` 为 `api/image-tasks` 时，实际请求地址将为 `https://api.example.com/api/image-tasks`；未以 `/` 结尾时则继续按 OpenAI 规范补齐 `/v1`。

**创建方式：**

1. **应用内生成**：进入 **设置 → API 配置 → 接入方式 → 创建自定义 HTTP 接口 → AI 一键生成与导入**，复制生成提示词，与第三方 API 文档一起交给 LLM 生成配置 JSON，再从剪贴板读取。
2. **应用内导出**：生成完成后，在 **API 配置 → 配置管理 → 配置下拉列表 → 对应配置的分享按钮** 中复制分享链接，或导出 JSON。部署预置请使用导出的 JSON 文件，并按下方格式填写稳定的服务商与配置 ID；分享链接用于接收方预览导入。

也可以参考 [自定义供应商 LLM 提示词](docs/custom-connection-llm-prompt.md)，将提示词和第三方 API 文档直接发给任意 LLM，手动获取完整 JSON。

**完整 JSON 示例（含异步任务供应商定义）：**

```json
{
  "customConnections": [
    {
      "id": "custom-example-task",
      "name": "示例异步任务供应商",
      "submit": {
        "path": "images/generations",
        "method": "POST",
        "contentType": "json",
        "body": {
          "model": "$profile.model",
          "prompt": "$prompt",
          "size": "$params.size",
          "quality": "$params.quality",
          "output_format": "$params.output_format",
          "output_compression": "$params.output_compression",
          "n": "$params.n",
          "image_urls": "$inputImages.dataUrls"
        },
        "taskIdPath": "data.0.task_id"
      },
      "poll": {
        "path": "tasks/{task_id}",
        "method": "GET",
        "intervalSeconds": 5,
        "statusPath": "data.status",
        "successValues": ["completed"],
        "failureValues": ["failed", "cancelled"],
        "errorPath": "data.error.message",
        "result": {
          "imageUrlPaths": ["data.result.images.*.url.*"],
          "b64JsonPaths": []
        }
      }
    }
  ],
  "profiles": [
    {
      "id": "example-profile",
      "name": "示例异步任务供应商",
      "connectionId": "custom-example-task",
      "baseUrl": "https://api.example.com/v1",
      "model": "gpt-image-2.5-sunburst"
    }
  ]
}
```

示例中的 `example-profile` 是唯一配置，因此自动成为默认预置配置。若添加更多配置，需要为其中一项设置 `isDefault: true`。

---

## 💻 技术栈

<div align="center">
  <br>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React 19" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://vite.dev/"><img src="https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E" alt="Vite" /></a>
  <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/Tailwind_CSS_3-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS 3" /></a>
  <a href="https://zustand.docs.pmnd.rs/"><img src="https://img.shields.io/badge/Zustand-764ABC?style=for-the-badge&logo=react&logoColor=white" alt="Zustand" /></a>
  <br>
  <br>
</div>

## 📄 许可证 & 致谢

本项目基于 [MIT License](LICENSE) 开源。

特别致谢：[LINUX DO](https://linux.do)

## ⭐ Star History

<div align="center">
  <a href="https://www.star-history.com/?repos=H3nryM4%2Fai-image-studio&type=date&legend=top-left">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=H3nryM4/ai-image-studio&type=date&theme=dark&legend=top-left" />
      <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=H3nryM4/ai-image-studio&type=date&legend=top-left" />
      <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=H3nryM4/ai-image-studio&type=date&legend=top-left" />
    </picture>
  </a>
</div>
