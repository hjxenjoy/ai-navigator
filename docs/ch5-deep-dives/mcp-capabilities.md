# 5.6 MCP·三种能力深入与高层 SDK

> 🕐 内容截至 2026-07｜涉及版本：MCP 2025-11-25（当前正式版）

[4.3](/ch4-agent-mcp/build-mcp) 用底层 `Server` API 手写了一个 MCP Server，帮你看清协议。这一节换成**高层 `McpServer` SDK**（实际项目用它，代码短一半），并把 MCP 的能力讲全：Tools、Resources、Prompts，以及两个进阶能力 Sampling 和 Elicitation。

## 先升级到高层 SDK

底层 `Server` 要你手动注册 `ListTools`、`CallTool` 等一堆 RequestHandler；高层 `McpServer` 把这些封装好，你只管"注册一个工具"。

```javascript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"

const server = new McpServer({ name: "shop-server", version: "1.0.0" })

// 启动（本地 stdio）
const transport = new StdioServerTransport()
await server.connect(transport)
```

---

## 能力一：Tools（工具）——AI 主动调用的"动作"

```javascript
server.registerTool(
  "get_order_status",
  {
    title: "查询订单状态",
    description: "根据订单号查询订单当前状态",
    inputSchema: { order_id: z.string().describe("订单号，如 ORD-12345") }  // 用 Zod 定义参数
  },
  async ({ order_id }) => {
    const status = await queryOrderFromDB(order_id)   // 你的真实业务逻辑
    return { content: [{ type: "text", text: JSON.stringify(status) }] }
  }
)
```

比底层写法清爽多了：参数用 Zod 声明（自带校验 + 自动生成 schema），handler 直接拿到解析好的参数。

> 💡 **Tool = 让 AI"做事"**（查库、下单、发消息）。这是最常用的能力。

---

## 能力二：Resources（资源）——AI 可读取的"数据"

资源是只读数据，像给 AI 开放的"文件/接口"。用 `ResourceTemplate` 定义带参数的 URI：

```javascript
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js"

server.registerResource(
  "order",
  new ResourceTemplate("orders://{id}", { list: undefined }),
  { title: "订单详情", description: "按 ID 读取订单数据" },
  async (uri, { id }) => ({
    contents: [{ uri: uri.href, text: JSON.stringify(await getOrder(id)) }]
  })
)
```

> 💡 **Tool vs Resource 的区别**：Tool 是"动作"（可能改变世界、AI 决定何时调用）；Resource 是"数据源"（只读、通常由客户端/用户挂载进上下文）。查订单状态用 Tool，把"产品手册"挂给 AI 读用 Resource。

---

## 能力三：Prompts（提示模板）——预置的"工作流入口"

把常用的 Prompt 模板预置在 Server 里，用户/客户端能一键调用：

```javascript
server.registerPrompt(
  "refund-reply",
  {
    title: "退款回复话术",
    description: "根据语气生成退款回复",
    argsSchema: { tone: z.string().describe("语气，如 正式/亲切") }
  },
  ({ tone }) => ({
    messages: [{ role: "user", content: { type: "text", text: `用${tone}的语气写一段标准退款回复` } }]
  })
)
```

> 💡 Prompts 适合把团队沉淀的"好提示"做成可复用入口（类似 [Skill / 斜杠命令](/ch4-agent-mcp/skill-harness)，但走 MCP 协议、可跨客户端）。

---

## 进阶能力一：Sampling（反向让客户端的模型干活）

通常是"AI 调用你的工具"。**Sampling 反过来**：你的 Server 在执行工具时，可以**请求客户端的 LLM 帮它生成内容**——Server 自己不用接模型、不用自己的 API key。

```javascript
// 在工具 handler 里，让客户端的模型帮忙总结
const result = await server.server.createMessage({
  messages: [{ role: "user", content: { type: "text", text: `总结这段日志：${log}` } }],
  maxTokens: 300
})
// result 里就是客户端模型生成的内容
```

> 💡 **比喻**：Server 是个不会写文案的工人，但它可以"借用"客户端那位会写的同事（模型）来帮它生成。好处：Server 保持轻量、不持有密钥；坏处：不是所有客户端都支持 Sampling。

Sampling 早已是正式协议能力（2025-11-25 版还支持让被借用的模型做 tool calling）。

> ⚠️ **注意方向变化**：在 2026-07-28 版协议中，Sampling 被标记为**废弃（deprecated）**，官方建议的替代方案是 Server 直接集成 LLM 提供商的 API（废弃后有至少 12 个月的保留窗口，现有代码不会立刻坏）。新写的 Server 如果强依赖"借客户端的模型"，要留意这个趋势，详见 [5.7 新版前瞻](./mcp-production)。

---

## 进阶能力二：Elicitation（中途向用户要信息）

Server 执行到一半发现缺参数，可以**暂停并向用户索要**，而不是直接失败。

```javascript
// 缺少收货地址时，主动问用户
const r = await server.server.elicitInput({
  message: "请提供收货地址以继续下单",
  requestedSchema: { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
})
// 拿到 r.content.address 再继续
```

> ⚠️ Elicitation 必须是"用户/Agent 发起的动作的延续"，不会凭空弹窗打扰用户。它让交互更自然（缺啥问啥），但同样依赖客户端支持。

2025-11-25 版还新增了 **URL 模式（URL mode）的 Elicitation**：涉及敏感信息（密码、API key、支付授权）时，Server 给用户一个 URL，用户在浏览器里直接和服务方完成交互，敏感凭据**不经过客户端和模型上下文**。规则很简单：**敏感凭据必须走 URL 模式**，别用普通表单字段收集。

---

## 扩展能力：MCP Apps（工具返回交互式界面）

2026 年初落地的 **MCP Apps**（SEP-1865，MCP 首个官方扩展）打破了"工具只能返回文本/结构化数据"的限制：工具可以声明一个 HTML UI 模板，宿主（Claude、VS Code、Goose 等已支持）把它渲染在**沙箱 iframe** 里——确认表单、数据图表、运维仪表盘都可以做成可点可填的界面。

- 模板提前声明，宿主可以在渲染前预取、缓存和安全审查
- 界面里用户的操作（点按钮、提交表单）仍走 MCP 的 JSON-RPC 通道，和直接调工具一样经过审计与确认
- 这是**扩展**而非核心能力，客户端不支持时会优雅降级为普通文本结果

---

## 能力速查

| 能力 | 谁主动 | 干嘛 | 典型场景 |
|-----|-------|-----|---------|
| **Tools** | AI 调 Server | 执行动作 | 查库、下单、发消息 |
| **Resources** | 客户端读 Server | 提供只读数据 | 挂载文档、配置、记录 |
| **Prompts** | 用户触发 | 预置提示模板 | 团队沉淀的工作流 |
| **Sampling** | Server 调客户端模型 | 借客户端的 LLM 生成 | Server 内部需要"智能"但不想接模型 |
| **Elicitation** | Server 问用户 | 中途索要缺失信息 | 缺参数时不失败、改追问（敏感凭据走 URL 模式） |
| **MCP Apps**（扩展） | Server 出 UI，宿主渲染 | 返回沙箱 iframe 里的交互式界面 | 确认表单、图表、仪表盘 |

---

## 🛠️ 实战练习：用高层 SDK 重写 4.3 的 Server

把 [4.3](/ch4-agent-mcp/build-mcp) 那个底层 `Server` 写的订单服务，改用 `McpServer` + `registerTool` + Zod 重写：

1. `npm i @modelcontextprotocol/sdk zod`
2. 用 `registerTool` 重写 `get_order_status`，参数用 Zod 声明
3. 再加一个 `registerResource` 暴露"最近订单列表"
4. 在 Claude Code 里 `claude mcp add` 挂上测试

**进阶挑战**：给一个工具加 Elicitation——当缺少必填参数时，让它向用户追问而不是报错。

---

## 📌 关键结论

1. 实际项目用高层 `McpServer` + `registerTool/Resource/Prompt`，参数用 Zod，代码比底层短一半
2. Tool=动作（AI 调）、Resource=只读数据（客户端挂）、Prompt=预置模板（用户触发）
3. Sampling：Server 反向借客户端的模型生成——但 2026-07-28 版已将其标记废弃，新代码优先考虑直接调 LLM API
4. Elicitation：Server 中途向用户要缺失信息；敏感凭据必须走 URL 模式，不进模型上下文
5. MCP Apps（SEP-1865 扩展）让工具返回沙箱 iframe 渲染的交互式界面，"MCP 只传文本"已过时；以上进阶能力都依赖客户端支持，用前先确认

---

下一节：[5.7 MCP·生产级远程服务](./mcp-production)
