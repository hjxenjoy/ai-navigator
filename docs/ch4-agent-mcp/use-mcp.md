# 4.2 用现有 MCP Server

> 🕐 内容截至 2026-07

Claude Code 通过配置文件来连接 MCP Server。这一节讲怎么找到、安装和配置现有的 MCP Server。

## 怎么添加 MCP Server

最简单的方式是用 `claude mcp` 命令行（推荐，它会帮你写好配置文件）：

```bash
# 添加一个本地 stdio Server（在你机器上跑一个进程）
claude mcp add filesystem -- npx -y @modelcontextprotocol/server-filesystem /path/to/dir

# 查看已配置的 Server
claude mcp list

# 在 Claude Code 里查看连接状态 / 处理登录
/mcp
```

**三种作用域（scope），决定配置写到哪、谁能用：**

| 作用域 | 写到哪 | 适合 |
|-------|-------|------|
| local（默认） | `~/.claude.json`，按项目路径隔离，不提交 | 只给自己、只在这个项目用 |
| project | 项目根目录 `.mcp.json`，**提交进 Git** | 团队共享，所有人 clone 后都有 |
| user | 全局，所有项目可用 | 你个人跨项目都想用的 Server |

```bash
# 团队共享：写进项目的 .mcp.json
claude mcp add --scope project github -- npx -y @modelcontextprotocol/server-github
```

`.mcp.json` 长这样（可手写，但用命令更省事）：

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}" }
    }
  }
}
```

> 💡 `.mcp.json` 提交进 Git 后，团队每个人打开项目都会得到同一套 Server（首次会提示确认，是安全护栏，别绕过）。密钥用环境变量 `${VAR}` 引用，不要硬编码进文件。

---

## 常用 MCP Server 一览

**官方维护的：**
- `@modelcontextprotocol/server-filesystem` — 文件系统读写
- `@modelcontextprotocol/server-github` — GitHub 操作（PR、Issues、代码）
- `@modelcontextprotocol/server-postgres` — PostgreSQL 查询
- `@modelcontextprotocol/server-sqlite` — SQLite 数据库
- `@modelcontextprotocol/server-fetch` — HTTP 请求
- `@modelcontextprotocol/server-memory` — 跨会话记忆存储

**社区热门的：**
- `@modelcontextprotocol/server-brave-search` — 网络搜索
- 各种 SaaS 集成（Slack、Notion、Linear 等）

---

## 安装和测试示例：GitHub MCP

**第一步：获取 GitHub Token**
到 GitHub Settings → Developer Settings → Personal Access Tokens

**第二步：添加 Server**

```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx
claude mcp add github -e GITHUB_PERSONAL_ACCESS_TOKEN=$GITHUB_TOKEN \
  -- npx -y @modelcontextprotocol/server-github
```

**第三步：测试**

```
你：列出我的 GitHub 仓库
Claude：（通过 GitHub MCP 查询）你有以下仓库...
```

用 `/mcp` 可以查看连接状态、排查没连上的问题。

---

## 远程（HTTP）Server 与 OAuth

上面是**本地 stdio** Server（在你机器上跑个进程）。还有一类是**远程 HTTP** Server——别人托管好的服务，你直接连 URL：

```bash
# 远程 HTTP Server
claude mcp add --transport http my-service https://example.com/mcp
```

很多远程 Server 用 **OAuth** 登录（不是填 token，而是浏览器授权）。在 Claude Code 里输入 `/mcp`，它会引导你完成浏览器登录。

> ⚠️ 早期的 SSE 传输方式已被 HTTP 取代，新接远程 Server 用 `--transport http`（旧 HTTP+SSE 传输在 2026-07-28 版协议中已被正式标记为废弃）。

---

## 安全注意事项

⚠️ MCP Server 能做很多事，权限控制很重要：

- **最小权限原则**：GitHub Token 只给需要的权限（只读就不要给写权限）
- **不要在代码里硬编码 Token**：用环境变量或 `.env` 文件
- **谨慎安装第三方 MCP Server**：代码会在你的机器上运行，要检查来源可信度
- **数据库 MCP**：在开发环境用只读账号，不要给生产数据库写权限

---

## 哪里找 MCP Server

- **官方 Registry**：registry.modelcontextprotocol.io — 官方维护的 Server 注册表
- **官方示例仓库**：github.com/modelcontextprotocol/servers
- **MCP.so**：第三方 MCP 市场
- **Smithery.ai**：MCP Server 搜索和发现

---

## 📌 关键结论

1. 用 `claude mcp add` 添加 Server，三种作用域：local（自己）、project（`.mcp.json` 团队共享）、user（全局）
2. 本地用 stdio，远程用 `--transport http`，OAuth 登录走 `/mcp` 命令
3. 官方维护了常用工具的 MCP Server，直接用不需要自己写
4. 用现有 Server 能让 Claude Code 直接访问你的数据库、GitHub、文件系统
5. 权限控制是关键，始终用最小权限原则；密钥用环境变量，别硬编码

---

下一节：[4.3 自己写 MCP Server](./build-mcp)
