# 4.3 自己写 MCP Server

当现有的 MCP Server 不满足你的需求时，可以自己写一个。这比想象中简单。

## 最简单的 MCP Server（Node.js）

```javascript
// my-mcp-server.js
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"

// 创建 Server 实例
const server = new Server(
  { name: "my-custom-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
)

// 定义工具列表
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_order_status",
      description: "根据订单号查询订单状态",
      inputSchema: {
        type: "object",
        properties: {
          order_id: {
            type: "string",
            description: "订单号，格式如 ORD-12345"
          }
        },
        required: ["order_id"]
      }
    }
  ]
}))

// 处理工具调用
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "get_order_status") {
    const { order_id } = request.params.arguments

    // 这里放你真实的业务逻辑
    const status = await queryOrderFromDB(order_id)

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(status)
        }
      ]
    }
  }
  
  throw new Error(`Unknown tool: ${request.params.name}`)
})

// 模拟数据库查询
async function queryOrderFromDB(orderId) {
  // 实际项目里这里连接你的数据库
  return {
    id: orderId,
    status: "已发货",
    estimatedDelivery: "2024-01-20"
  }
}

// 启动 Server
const transport = new StdioServerTransport()
await server.connect(transport)
console.error("MCP Server 已启动")
```

---

## 安装依赖和配置

```bash
# 初始化项目
mkdir my-mcp-server && cd my-mcp-server
npm init -y
npm install @modelcontextprotocol/sdk
```

**在 Claude Code 里配置：**

```json
// .claude/settings.json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["/absolute/path/to/my-mcp-server.js"]
    }
  }
}
```

---

## 添加 Resources（资源）

除了工具，你还可以提供资源让 AI 读取：

```javascript
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"

// 声明支持 resources
const server = new Server(
  { name: "my-server", version: "1.0.0" },
  { capabilities: { tools: {}, resources: {} } }
)

// 列出可用资源
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "orders://recent",
      name: "最近的订单",
      description: "最近 7 天的订单列表",
      mimeType: "application/json"
    }
  ]
}))

// 读取资源内容
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (request.params.uri === "orders://recent") {
    const orders = await getRecentOrders()
    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: "application/json",
          text: JSON.stringify(orders)
        }
      ]
    }
  }
  throw new Error("Resource not found")
})
```

---

## 什么时候该写 MCP Server

✅ 你需要 Claude Code 访问你公司的内部 API  
✅ 你需要 AI 能查询你项目特定的数据库  
✅ 你有一些重复性的操作想让 AI 自动化（查日志、检查部署状态）  
✅ 你想把自己的工具暴露给团队所有人用的 AI

---

## 📌 关键结论

1. 写 MCP Server 只需要安装一个 SDK，代码量不多
2. 核心是定义工具列表和处理工具调用两个 Handler
3. 写好之后，在 `.claude/settings.json` 里配置路径就能用
4. MCP Server 就是你的业务逻辑和 AI 之间的桥梁

---

下一节：[4.4 Claude Code 深度使用](./claude-code)
