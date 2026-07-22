# 4.1 MCP 是什么，为什么重要

> 🕐 内容截至 2026-07

MCP（Model Context Protocol）是 Anthropic 在 2024 年底发布的一个开放协议，定义了 AI 模型和外部工具之间的标准通信方式。

2025 年 12 月，Anthropic 把 MCP 捐赠给了 Linux 基金会旗下的 **Agentic AI Foundation（AAIF，智能体 AI 基金会）**——它由 Anthropic、Block、OpenAI 联合创立，还托管 goose、AGENTS.md 等项目。从此 MCP 由中立基金会治理，不再属于任何一家公司（据第三方报道，AAIF 成立数月内成员组织已超过 170 家）。

## 在 MCP 之前

以前，如果你想让 AI 能访问你的数据库、调用你的 API、读取你的文件，你需要：
- 针对每个 AI 平台（Claude、GPT...）写不同的集成代码
- 每个工具都要重新定义 Function Calling Schema
- 工具和 AI 是紧耦合的，换个 AI 就要重写

```
GPT-4 ←→ 自定义集成 ←→ 数据库
Claude ←→ 不同的自定义集成 ←→ 数据库
Gemini ←→ 又不同的集成 ←→ 数据库
```

---

## MCP 做了什么

MCP 定义了一个标准协议：工具（Server）和 AI 客户端（Client）之间怎么通信。

```
之前：
AI ←→ 每个工具的自定义代码

之后：
AI (MCP Client) ←→ [MCP 协议] ←→ MCP Server（工具）
```

**结果：**
- 一个 MCP Server 写好，所有支持 MCP 的 AI 都能用
- AI 客户端不需要知道工具的实现细节，只要遵守协议
- 工具生态能快速扩展（官方 2025 年 12 月口径：公开 MCP Server 已超过 1 万个，Python + TypeScript SDK 月下载量超 9700 万次；第三方 2026 年中的统计更高）

---

## MCP 的三种能力

MCP Server 可以提供三种类型的能力：

**1. Tools（工具）**

AI 可以主动调用的功能，比如搜索、查询数据库、执行代码。

```javascript
// Server 定义一个工具
{
  name: "search_database",
  description: "在产品数据库中搜索商品",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      limit: { type: "number" }
    }
  }
}
```

**2. Resources（资源）**

AI 可以读取的数据，比如文件内容、数据库记录。

```javascript
// Server 提供一个资源
{
  uri: "db://products/all",
  name: "产品列表",
  mimeType: "application/json"
}
```

**3. Prompts（提示模板）**

预定义的 Prompt 模板，让用户或 AI 快速调用。

> 💡 **MCP 不只传文本**：2026 年初落地的 **MCP Apps**（SEP-1865，MCP 首个官方扩展）让工具可以返回在**沙箱 iframe** 中渲染的交互式 HTML 界面——表单、图表、仪表盘都行。"MCP 只能传文本"的说法已经过时。

---

## MCP 的工作流程

```
1. AI 客户端（如 Claude Code）启动时，连接配置的 MCP Server
2. Server 告诉 Client 它有哪些工具/资源可以用
3. 用户提出需求
4. AI 决定需要调用哪个工具
5. AI 通过 MCP 协议调用 Server 上的工具
6. Server 执行并返回结果
7. AI 根据结果生成回答
```

---

## 为什么这对你很重要

你现在用 Claude Code，它已经支持 MCP。这意味着：

1. **直接用现有的 MCP Server**  
   已经有上万个公开 MCP Server：GitHub、Slack、数据库、文件系统、浏览器控制...

2. **给 Claude Code 添加你的业务能力**  
   写一个 MCP Server，让 Claude Code 能查你的数据库、调用你的内部 API

3. **AI 工具的通用扩展方式**  
   所有主流 AI 客户端（Claude、ChatGPT、Cursor、Gemini、Microsoft Copilot、VS Code 等）都已支持 MCP，学一次，处处可用

---

## 📌 关键结论

1. MCP 是 AI 和外部工具之间的标准协议，让工具写一次、到处可用
2. MCP 已由 Linux 基金会旗下的 AAIF 中立治理，主流 AI 客户端全部支持，是事实上的行业标准
3. MCP Server 可以提供三种能力：工具（可调用）、资源（可读取）、提示模板；MCP Apps 扩展还能返回交互式界面
4. Claude Code 已经内置 MCP 支持，可以直接接入现有 Server
5. 学会写 MCP Server 是扩展 AI 能力边界最直接的方式

---

下一节：[4.2 用现有 MCP Server](./use-mcp)
