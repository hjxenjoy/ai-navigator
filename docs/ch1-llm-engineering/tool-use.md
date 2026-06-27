# 1.4 Tool Use 深度使用

Tool Use（也叫 Function Calling）是让 AI 能够调用外部工具的机制。这是构建 Agent 最核心的技术。

## 原理：AI 并不真的"执行"代码

很多人以为 Tool Use 是 AI 直接运行代码。**实际上完全不是这样。**

真实流程：

```
1. 你定义好工具（告诉 AI 有什么工具可以用）
          ↓
2. 你发消息给 AI
          ↓
3. AI 决定要不要用工具，如果要用，返回一个"调用请求"
   （这只是一段 JSON，不是真正的执行）
          ↓
4. 你的代码收到这个 JSON，你去真正执行这个工具
          ↓
5. 你把执行结果返回给 AI
          ↓
6. AI 根据结果，生成最终回复
```

> 💡 **类比**：AI 是一个下达命令的管理者，你的代码是真正做事的执行者。AI 说"去查一下数据库里有没有这个用户"，你的代码真正去查，然后把结果告诉 AI。

---

## 定义工具：Tool Schema

Tool Schema 是你告诉 AI"这个工具是什么、怎么用"的描述。

```javascript
// 定义一个查询天气的工具
const tools = [
  {
    name: "get_weather",
    description: "查询指定城市的当前天气。当用户问天气相关问题时使用。",
    input_schema: {
      type: "object",
      properties: {
        city: {
          type: "string",
          description: "城市名称，如'北京'、'上海'"
        },
        unit: {
          type: "string",
          enum: ["celsius", "fahrenheit"],
          description: "温度单位，默认 celsius"
        }
      },
      required: ["city"]
    }
  }
]
```

**关键：description 写好是成功的一半**

AI 靠 description 来判断什么时候该用这个工具。描述要清楚说明：
- 这个工具做什么
- 什么情况下用
- 不应该用于什么情况（如果有必要）

---

## 完整代码示例（Node.js）

```javascript
import Anthropic from "@anthropic-ai/sdk"

const client = new Anthropic()

// 工具定义
const tools = [
  {
    name: "get_user",
    description: "根据用户 ID 从数据库查询用户信息",
    input_schema: {
      type: "object",
      properties: {
        user_id: { type: "string", description: "用户的唯一 ID" }
      },
      required: ["user_id"]
    }
  }
]

// 模拟数据库查询
function getUserFromDB(userId) {
  return { id: userId, name: "张三", email: "zhang@example.com" }
}

async function chat(userMessage) {
  const messages = [{ role: "user", content: userMessage }]

  while (true) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      tools,
      messages
    })

    // AI 完成了，返回最终回复
    if (response.stop_reason === "end_turn") {
      return response.content[0].text
    }

    // AI 要调用工具
    if (response.stop_reason === "tool_use") {
      // 把 AI 的回复加入消息历史
      messages.push({ role: "assistant", content: response.content })

      // 执行所有工具调用
      const toolResults = []
      for (const block of response.content) {
        if (block.type === "tool_use") {
          let result
          if (block.name === "get_user") {
            result = getUserFromDB(block.input.user_id)
          }
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result)
          })
        }
      }

      // 把工具结果返回给 AI
      messages.push({ role: "user", content: toolResults })
    }
  }
}

const result = await chat("帮我查一下 user_123 的信息")
console.log(result)
```

---

## Structured Output：让 AI 只输出 JSON

当你需要 AI 输出固定格式的数据（而不是自然语言），有两个方式：

**方式一：在 Prompt 里说清楚**
```
请以 JSON 格式输出，格式如下：
{ "name": "...", "age": ..., "tags": [...] }
只输出 JSON，不要有其他文字。
```

**方式二：使用 JSON Mode（部分模型支持）**
```javascript
// OpenAI 的写法
{ response_format: { type: "json_object" } }

// 某些模型支持 JSON Schema 约束输出格式
```

> ⚠️ 即使用了 JSON Mode，也要做 JSON.parse 的 try-catch，AI 偶尔还是会输出不合法的 JSON。

---

## 为什么 Tool Use 会失败

常见原因：

1. **Description 写得不清楚** → AI 不知道什么时候该用这个工具，或者用错了
2. **参数设计太复杂** → AI 填参数时填错
3. **工具执行报错，没有把错误信息反馈给 AI** → AI 不知道出了什么问题，继续往下走
4. **工具太多** → AI 选错工具

---

## 📌 关键结论

1. AI 不直接执行代码，而是发出"调用请求"，由你的代码真正执行
2. Tool Schema 的 description 是核心，写清楚才能让 AI 正确使用工具
3. 工具执行失败时，要把错误信息返回给 AI，让它能调整
4. 工具数量不要太多，精选比大而全更好

---

下一节：[1.5 多轮对话与状态管理](./conversation)
