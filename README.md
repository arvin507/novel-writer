# 本地单机版短篇故事创作工作台

一个本地 Web 工具：用浏览器访问 `localhost`，通过第三方 OpenAI-compatible Chat Completions API 辅助创作短篇故事。

## 启动

```bash
npm install
npm run setup
npm run dev
```

打开：

```text
http://localhost:3000
```

Windows 和 macOS 都使用同一组 npm 命令。

## 配置

复制示例环境文件：

```bash
cp .env.example .env
```

Windows PowerShell 可以用：

```powershell
Copy-Item .env.example .env
```

也可以直接在 `/settings` 页面配置：

- Provider 名称
- API 模式：`chat_completions` 使用 `/v1/chat/completions`，`responses` 使用 `/v1/responses`
- 推理强度：`reasoning.effort`，例如 `high` 接近 Codex 复杂任务模式
- Responses 流式返回：启用后使用 `/v1/responses` 的 SSE 流式输出，长任务更不容易被网关空等超时切断
- Base URL，例如 `https://api.example.com` 或 `https://api.example.com/v1`
- API Key
- 模型名称
- temperature
- max tokens
- timeout

API Key 只保存在本地 SQLite，不会暴露给前端。

## 数据与导出

- SQLite 数据库：`local.db`
- 导出目录：`exports/`
- 支持导出 Markdown、TXT、DOCX、设定集、大纲场景卡、投稿自检报告

## 常用命令

```bash
npm run dev        # 本地开发服务
npm run build      # 生产构建检查
npm run lint       # 代码检查
npm run typecheck  # 类型检查
npm test           # 基础自检
npm run db:push    # 初始化本地 SQLite 表
```
