# 1.5 多轮对话与状态管理

AI 本身是无状态的——每次 API 调用都是独立的，它不会记得上次你说了什么。"多轮对话"的感觉，是靠你的代码维护历史消息来实现的。

## 对话历史是怎么工作的

```javascript
// 每次请求，你都要把完整的对话历史传给 AI
const messages = [
  { role: "user", content: "你好，我叫张三" },
  { role: "assistant", content: "你好，张三！有什么我能帮你的吗？" },
  { role: "user", content: "我叫什么名字？" }  // AI 能回答这个，因为历史在 messages 里
]
```

你的代码负责：
1. 把每次对话追加到 messages 数组
2. 每次请求都把完整 messages 传给 API
3. 决定什么时候清空/截断历史

---

## 状态管理的几种模式

**模式一：内存里维护（最简单）**
```javascript
const sessions = new Map() // sessionId -> messages[]

function getMessages(sessionId) {
  if (!sessions.has(sessionId)) sessions.set(sessionId, [])
  return sessions.get(sessionId)
}
```
缺点：服务重启后消失，不同进程之间不共享。

**模式二：数据库持久化（生产推荐）**
```javascript
// 每次对话存 DB，根据 sessionId 读取历史
const messages = await db.messages.findMany({
  where: { sessionId },
  orderBy: { createdAt: 'asc' }
})
```

**模式三：客户端维护**
把消息历史存在前端（localStorage 或组件状态），每次请求时由前端传给后端。  
缺点：用户清空浏览器缓存就丢失了。

---

## 上下文太长时怎么办

长对话会让 Token 数越来越多，既贵又可能超出上下文窗口。常见处理策略：

**策略一：滑动窗口**
只保留最近 N 条消息。

```javascript
const MAX_MESSAGES = 20
if (messages.length > MAX_MESSAGES) {
  // 保留 system prompt，截取最近的消息
  messages = [systemMessage, ...messages.slice(-MAX_MESSAGES)]
}
```
缺点：丢失了早期的重要信息。

**策略二：摘要压缩**
当历史太长时，让 AI 先把之前的对话总结成一段摘要，用摘要替代原始历史。

```javascript
if (totalTokens > TOKEN_LIMIT * 0.8) {
  const summary = await summarizeHistory(messages.slice(0, -10))
  messages = [
    systemMessage,
    { role: "user", content: `[之前对话摘要] ${summary}` },
    ...messages.slice(-10)  // 保留最近 10 条原始消息
  ]
}
```

**策略三：重要信息提取存储**
把对话中的重要信息（用户偏好、确认的决策、关键上下文）提取出来存数据库，作为 System Prompt 的一部分注入，而不是靠对话历史传递。

---

## Memory（记忆）的几种类型

在 Agent 设计里，"Memory"通常指不同时间范围的信息存储：

| 类型 | 时效 | 存储位置 | 示例 |
|-----|-----|---------|------|
| 工作记忆 | 当次对话 | 上下文窗口 | 你刚说的话 |
| 短期记忆 | 一个 Session | 数据库 | 这次会话的历史 |
| 长期记忆 | 永久 | 数据库 | 用户偏好、历史项目信息 |
| 外部记忆 | 永久 | 知识库/向量DB | 文档、FAQ |

---

## 📌 关键结论

1. AI 本身无状态，"记忆"靠你的代码维护消息历史
2. 长对话要主动管理 Token 消耗，用摘要或滑动窗口
3. 重要信息不要只依赖对话历史，提取出来存数据库更可靠

---

下一节：[1.6 流式输出与成本控制](./streaming-cost)
