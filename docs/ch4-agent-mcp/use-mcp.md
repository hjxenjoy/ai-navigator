# 4.2 用现有 MCP Server

Claude Code 通过配置文件来连接 MCP Server。这一节讲怎么找到、安装和配置现有的 MCP Server。

## 配置文件在哪

Claude Code 的 MCP 配置在 `.claude/settings.json` 文件里（项目级），或者 `~/.claude/settings.json`（全局）。

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "你的token"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"]
    }
  }
}
```

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

**第二步：添加配置**

```json
// .claude/settings.json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxxxxxxxxxxx"
      }
    }
  }
}
```

**第三步：重启 Claude Code，测试**

```
你：列出我的 GitHub 仓库
Claude：（通过 GitHub MCP 查询）你有以下仓库...
```

---

## 安全注意事项

⚠️ MCP Server 能做很多事，权限控制很重要：

- **最小权限原则**：GitHub Token 只给需要的权限（只读就不要给写权限）
- **不要在代码里硬编码 Token**：用环境变量或 `.env` 文件
- **谨慎安装第三方 MCP Server**：代码会在你的机器上运行，要检查来源可信度
- **数据库 MCP**：在开发环境用只读账号，不要给生产数据库写权限

---

## 哪里找 MCP Server

- **官方列表**：github.com/modelcontextprotocol/servers
- **MCP.so**：第三方 MCP 市场
- **Smithery.ai**：MCP Server 搜索和发现

---

## 📌 关键结论

1. MCP 配置在 `.claude/settings.json`，添加 Server 后重启生效
2. 官方维护了常用工具的 MCP Server，直接用不需要自己写
3. 用现有 Server 能让 Claude Code 直接访问你的数据库、GitHub、文件系统
4. 权限控制是关键，始终用最小权限原则

---

下一节：[4.3 自己写 MCP Server](./build-mcp)
