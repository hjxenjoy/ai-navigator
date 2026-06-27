# 1.6 流式输出与成本控制

## 流式输出（Streaming）

你发了消息，AI 不是生成完所有内容再一次性返回，而是每生成一个 Token 就立刻发送给你。这就是流式输出。

**为什么要用流式：**
- 用户体验：用户立刻看到内容开始出现，不用盯着空白等待
- 性能感知：即使总时间差不多，"立刻开始出字"比"等待后一下全出来"感觉快得多
- 可以中断：用户觉得 AI 走偏了，可以立刻停止，不用等完

**Node.js 实现：**

```javascript
const stream = await client.messages.stream({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  messages: [{ role: "user", content: "写一首诗" }]
})

// 方式一：逐 Token 处理
for await (const chunk of stream) {
  if (chunk.type === "content_block_delta") {
    process.stdout.write(chunk.delta.text)
  }
}

// 方式二：等待完整文本
const message = await stream.finalMessage()
```

**在 Web 项目里用 SSE（Server-Sent Events）：**

```javascript
// 后端（Node.js）
app.get("/chat", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")

  const stream = await client.messages.stream({ ... })

  for await (const chunk of stream) {
    if (chunk.type === "content_block_delta") {
      res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`)
    }
  }
  res.end()
})

// 前端
const eventSource = new EventSource("/chat")
eventSource.onmessage = (e) => {
  const { text } = JSON.parse(e.data)
  displayArea.textContent += text
}
```

---

## 成本控制

AI API 的费用主要来自 Token 消耗。几个常见的优化方向：

**1. 精简 System Prompt**

System Prompt 每次请求都会作为输入 Token 计费。一个 2000 Token 的 System Prompt，每天 1000 次请求 = 200 万输入 Token，不便宜。

做法：只放真正需要的内容，去掉废话。

**2. 利用 Prompt Caching（KV Cache）**

当你的 System Prompt 很长但很固定，可以启用缓存。被缓存的 Token 后续请求只按很低的价格计费。

```javascript
// Anthropic 的缓存写法
{
  role: "user",
  content: [
    {
      type: "text",
      text: "这是一个很长的系统提示...",
      cache_control: { type: "ephemeral" }  // 标记为可缓存
    }
  ]
}
```

**3. 选对模型**

| 任务 | 推荐模型 | 原因 |
|-----|---------|------|
| 简单问答、分类 | Haiku / Flash | 便宜 10-50 倍，够用 |
| 复杂代码、推理 | Sonnet / GPT-4o | 性价比好 |
| 极复杂任务 | Opus / o1 | 能力最强，也最贵 |

**4. 控制输出长度**

如果任务不需要长回复，明确告诉 AI：
```
请用不超过 200 字回答。
只输出代码，不要解释。
```

**5. 批处理非实时任务**

如果有大量文档需要处理，不需要实时，使用 Batch API 通常便宜 50%。

---

## Rate Limiting 是什么

Rate Limiting 是 API 提供商对请求频率的限制，**不是"打分"**。

常见限制维度：
- **RPM（Requests Per Minute）**：每分钟最多发多少次请求
- **TPM（Tokens Per Minute）**：每分钟最多使用多少 Token
- **TPD（Tokens Per Day）**：每天最多使用多少 Token

当你的 Agent 跑得很快、并发很高时，会遇到限流报错（429 Too Many Requests）。

**处理方式：**
```javascript
// 遇到 429 时，等待后重试
async function callWithRetry(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (e) {
      if (e.status === 429) {
        const waitMs = Math.pow(2, i) * 1000  // 指数退避：1s, 2s, 4s
        await new Promise(r => setTimeout(r, waitMs))
      } else throw e
    }
  }
}
```

---

## 📌 关键结论

1. 几乎所有用户交互场景都应该用流式输出
2. System Prompt 是隐性成本大户，要保持精简
3. 根据任务复杂度选模型，简单任务用便宜的
4. 遇到 Rate Limit 报错，用指数退避重试

---

第 1 章完成。下一步：[第 2 章 · 构建 AI 产品](/ch2-build-products/)
