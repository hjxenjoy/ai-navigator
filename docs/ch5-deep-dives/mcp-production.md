# 5.7 MCP·生产级远程服务

> 🕐 内容截至 2026-07｜涉及版本：MCP 2025-11-25（当前正式版）

前面的 MCP Server 都是**本地 stdio**（在你机器上跑个进程）。要让团队、或云端 Agent 都能用，得做成**远程 HTTP 服务**。这一节讲怎么把 MCP Server 部署成生产级的远程服务，以及鉴权、调试、安全。

## 本地 stdio vs 远程 HTTP

```
stdio（本地）                    Streamable HTTP（远程）
──────────                       ──────────
在你机器上启动一个子进程      →   部署成一个 HTTP 服务，谁都能连
只有本机能用                  →   团队 / 云端 Agent 共享
无需鉴权                      →   需要 OAuth 鉴权
适合个人工具                  →   适合团队/对外服务
```

> ⚠️ 早期的 SSE 传输已被 **Streamable HTTP** 取代（[4.2](/ch4-agent-mcp/use-mcp) 也提过）。新做远程服务一律用 Streamable HTTP。

---

## 用 Streamable HTTP 起一个远程 Server

当前正式版协议（2025-11-25）在协议层仍是**有会话的**（连接要先 `initialize` 握手，之后每个请求带 `Mcp-Session-Id` 头），但 SDK 支持**无状态模式**：每个请求新建一次 server + transport。这种模式部署大大简化——不需要粘性会话（sticky session），可以直接挂在普通的轮询负载均衡后面、水平扩容。而且这正是协议的演进方向：下一版（2026-07-28）会把无状态变成协议本身的默认形态（见文末"新版前瞻"）。最简单的无状态写法：

```javascript
import express from "express"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { z } from "zod"

function buildServer() {
  const server = new McpServer({ name: "shop-server", version: "1.0.0" })
  server.registerTool(
    "get_order_status",
    { title: "查询订单", description: "按订单号查状态", inputSchema: { order_id: z.string() } },
    async ({ order_id }) => ({ content: [{ type: "text", text: JSON.stringify(await queryOrderFromDB(order_id)) }] })
  )
  return server
}

const app = express()
app.use(express.json())

app.post("/mcp", async (req, res) => {
  // 无状态模式：每个请求独立的 server + transport，互不干扰
  const server = buildServer()
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  res.on("close", () => { transport.close(); server.close() })  // 请求结束就清理
  await server.connect(transport)
  await transport.handleRequest(req, res, req.body)
})

app.listen(3000, () => console.log("MCP server on :3000/mcp"))
```

客户端这样挂（[4.2](/ch4-agent-mcp/use-mcp)）：

```bash
claude mcp add --transport http shop https://your-domain.com/mcp
```

---

## 鉴权：OAuth（别自己手搓）

远程 Server 对外开放，必须鉴权。MCP 在**传输层用 OAuth 2.0**：客户端代表用户去授权服务器拿 token，再带着 token 访问你的 Server。

关键点（了解即可，不用背）：
- Server 声明自己是"受保护资源"，告诉客户端去哪授权
- 客户端走标准 OAuth 流程拿 token（支持动态客户端注册 DCR，省去手动登记）
- 有一些安全校验（如客户端要校验授权响应里的 `iss`，防 mix-up 攻击）

> ⚠️ **别自己从零实现 OAuth**——容易出安全漏洞。用现成的授权服务（Auth0、自家 IdP）或 SDK/框架提供的 MCP auth 支持，把鉴权委托出去。你只负责"校验 token、识别用户"。

---

## 调试：MCP Inspector

开发 MCP Server 别靠"挂进 Claude Code 反复试"，用官方 **MCP Inspector**：一个可视化工具，能列出你的 tools/resources/prompts、手动触发调用看输入输出、还能跑 OAuth 流程。

```bash
npx @modelcontextprotocol/inspector
# 连上你的 server（stdio 命令 或 http URL），逐个工具点着测
```

> 💡 先用 Inspector 把每个工具调通、schema 看对，再挂进真实客户端——能省掉大量"在 Agent 里反复跑"的时间。

---

## 生产清单

把 MCP Server 推上线前，对照（很多呼应 [2.6](/ch2-build-products/production) / [2.7](/ch2-build-products/security)）：

- [ ] 用 **Streamable HTTP**，无状态模式优先（易扩容）
- [ ] **OAuth 鉴权**，委托给成熟方案，不手搓
- [ ] 工具 handler 加 **try-catch**，把错误以清晰文本返回（让 Agent 能感知，见 [4.8 错误恢复](/ch4-agent-mcp/harness-engineering)）
- [ ] **最小权限**：每个工具只能做该做的事，参数用 Zod 严格校验（[2.7](/ch2-build-products/security)）
- [ ] 危险操作（写库、删除、花钱）要么不暴露、要么二次确认
- [ ] **限流 + 超时 + 日志**（[2.6](/ch2-build-products/production)）
- [ ] 上线前用 **Inspector** 把所有工具和 OAuth 流程跑通
- [ ] 启用 DNS rebinding 防护（`enableDnsRebindingProtection`、`allowedHosts`）

---

## 🔮 2026-07-28 新版前瞻：协议层无状态化

下一版 MCP 规范 **2026-07-28** 定于 2026 年 7 月 28 日发布（RC 已于 2026 年 5 月 21 日冻结），官方称之为协议诞生以来最大的一次修订。核心变化：

- **协议层无状态化**：删除 `initialize` 握手和 `Mcp-Session-Id` 头（SEP-2575 / SEP-2567），每个请求自带协议版本和客户端信息，任何 server 实例都能处理；新增 `server/discover` 方法，客户端按需获取 server 能力
- **可路由、可缓存**：新增 `Mcp-Method` / `Mcp-Name` 请求头，负载均衡和网关不用解析请求体就能路由；`tools/list` 等结果携带 `ttlMs` / `cacheScope`，客户端可以放心缓存
- **扩展成为一等公民**：新增 extensions 框架；Tasks（长任务）从核心移到扩展；MCP Apps 是首个官方扩展（见 [5.6](./mcp-capabilities)）
- **首个正式废弃政策**：Roots、Sampling、Logging 和旧 HTTP+SSE 传输被标记为废弃（deprecated），废弃后至少保留 12 个月才可能移除

**对自托管 Server 的影响：**

- 好消息：不再需要粘性会话（sticky session）和共享 session 存储，普通轮询负载均衡 + 水平扩容即可——本节的无状态模式恰好提前适应了这个方向
- 要改的：跨调用状态（比如"当前购物车"）不能再藏在协议会话里，改用**显式句柄**模式——工具返回一个 ID（如 `basket_id`），让模型在后续调用中作为普通参数传回来
- 节奏：配套 SDK 仍在 beta，先在分支里盘点代码中对会话的依赖、做原型验证，别急着把 beta 发上生产

> ⚠️ 旧版错误码 `-32002`（资源不存在）在新版改为 JSON-RPC 标准的 `-32602`。如果你的客户端按字面匹配了这个错误码，迁移时记得更新。

---

## 🛠️ 实战练习：把工具暴露成远程 HTTP 服务

1. 用上面的 Express + Streamable HTTP 起一个本地服务（`http://localhost:3000/mcp`）
2. 用 `npx @modelcontextprotocol/inspector` 连上去，手动调用 `get_order_status` 看返回
3. 用 `claude mcp add --transport http` 挂进 Claude Code，问它"查一下订单 ORD-123"
4. 给工具故意制造一个错误，验证错误是否以清晰文本返回给了 Agent

**进阶挑战**：加一个最小的 token 校验中间件（先用固定 token 模拟），体会"受保护的远程 Server"的访问流程。

---

## 📌 关键结论

1. 远程 MCP 用 Streamable HTTP（SSE 已淘汰）；当前协议层仍带会话，无状态模式最易部署扩容，且正是 2026-07-28 新版的协议默认形态
2. 2026-07-28 新版是史上最大修订：协议无状态化、响应可缓存、扩展框架、首个废弃政策——自托管服务要提前盘点会话依赖
3. 远程服务必须 OAuth 鉴权，委托给成熟方案，绝不自己手搓；开发用 MCP Inspector 可视化调试工具和 OAuth
4. 生产清单：错误处理、最小权限、危险操作确认、限流超时日志、DNS 防护
5. MCP Server 本质是"业务能力的对外接口"，安全和稳健性按生产 API 的标准来要求

---

下一节：[5.8 MCP·选型决策](./mcp-decision)
