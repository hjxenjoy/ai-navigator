# 1.16 Prompt Caching：让重复内容不重复计费

如果你的 System Prompt 有 2000 个 Token，每天调用 5000 次，光这一项就是 1000 万 Token 的输入费用——而这 2000 个 Token 的内容每次都完全一样。

Prompt Caching 就是为了解决这个浪费。

---

## 是什么

语言模型处理输入时，内部会计算每个 Token 的"注意力权重"，这个中间结果叫 **KV Cache（键值缓存）**。

如果两次请求的开头内容完全一样，模型就不必重新计算——直接复用上次的结果。被复用的 Token 计费极低，通常是正常价格的 10%～30%。

> 💡 **类比**：就像打印机的纸张预热。第一次打印要等机器预热，后续同一张纸的格式如果没变，直接从上次的状态接着打——省时省钱。Prompt Caching 就是模型对"重复输入"的预热复用。

---

## 什么情况下值得用

满足这三个条件时，Prompt Caching 效果最明显：

| 条件 | 说明 |
|------|------|
| **固定内容很长** | System Prompt > 500 Token，或 RAG 检索出来的文档段落很长 |
| **调用频率高** | 同一内容被多次调用，缓存命中率才有意义 |
| **前缀保持稳定** | 固定部分必须在每次请求的相同位置，不能每次打乱顺序 |

典型场景：
- 长 System Prompt（角色设定 + 规则 + 示例）
- RAG：每次把大段文档塞进上下文
- Few-shot：固定几十条示例
- 多轮对话：历史对话越来越长

---

## 两种实现方式

### 方式一：自动缓存（DeepSeek / OpenAI / 大多数厂商）

什么都不用改。只要你每次请求开头的内容保持一致，API 后端自动缓存，命中时按低价计费。

唯一要做的事：**把固定内容放在最前面**，变化的内容放在最后面。

```javascript
const response = await openai.chat.completions.create({
  model: 'deepseek-chat',
  messages: [
    {
      role: 'system',
      // 这个 System Prompt 如果每次都一样，自动被缓存
      content: `你是一个专业的客服助手，负责解答关于我们电商平台的问题。

以下是完整的产品手册（约 3000 字）：
${productManual}

以下是常见问题和标准回答（约 2000 字）：
${faqContent}

回答规则：
1. 只回答与平台相关的问题
2. 无法确定时说"请联系人工客服"
3. 回复简洁，不超过 150 字`
    },
    {
      role: 'user',
      content: userQuestion   // 每次不同的用户问题放最后
    }
  ]
})
```

如何确认命中了缓存？查看响应的 `usage` 字段：

```javascript
console.log(response.usage)
// {
//   prompt_tokens: 5200,
//   completion_tokens: 85,
//   prompt_cache_hit_tokens: 5000,   // ← 命中缓存的 Token 数
//   prompt_cache_miss_tokens: 200    // ← 未命中（用户问题）
// }
```

---

### 方式二：手动标记（Anthropic Claude）

Claude 需要你在内容块上显式打标记，告诉它"这里可以缓存"：

```javascript
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

const response = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  system: [
    {
      type: 'text',
      text: `你是一个专业的代码审查助手。

以下是项目的完整编码规范（约 4000 字）：
${codingStandards}

以下是过去的审查案例（约 3000 字）：
${reviewExamples}`,
      cache_control: { type: 'ephemeral' }   // ← 打上缓存标记
    }
  ],
  messages: [
    {
      role: 'user',
      content: `请审查以下代码：\n\n${codeToReview}`
    }
  ]
})

// 查看缓存状态
console.log(response.usage)
// {
//   input_tokens: 120,
//   cache_creation_input_tokens: 7200,   // ← 首次：写入缓存
//   cache_read_input_tokens: 0
// }

// 第二次请求同样内容时：
// {
//   input_tokens: 120,
//   cache_creation_input_tokens: 0,
//   cache_read_input_tokens: 7200        // ← 命中缓存，按低价计费
// }
```

Claude 的缓存有效期是 **5 分钟**（ephemeral），如果超过 5 分钟没有新请求命中，缓存会失效，下次再请求时重新写入。高频场景下基本不会过期。

---

## 关键原则：前缀稳定

缓存命中的前提是"前缀相同"。一旦固定内容的前面有任何变化，后面的缓存全部失效。

**错误做法**：把动态内容插在固定内容里面

```javascript
// ❌ 错：用户名插在 System Prompt 中间，每次都不同
system: `你是客服助手。当前用户：${userName}

${产品手册 - 3000 Token}
${FAQ - 2000 Token}`
// 用户名不同 → 前缀不同 → 后面的 5000 Token 每次都要重新计算
```

**正确做法**：固定内容集中放前面，动态内容放最后

```javascript
// ✅ 对：固定的长内容在前，动态信息放用户消息里
system: `你是客服助手。

${产品手册 - 3000 Token}
${FAQ - 2000 Token}`

// 用户名等动态信息放在 user 消息里
messages: [{ role: 'user', content: `用户：${userName}\n问题：${question}` }]
```

---

## 成本计算示例

场景：长 System Prompt 2000 Token + 用户问题 100 Token，每天 5000 次调用，使用 DeepSeek-V4 Pro：

| | 不用缓存 | 用缓存（假设 90% 命中率） |
|--|--------|---------------------|
| 输入 Token | 2100 × 5000 = 1050 万 | 缓存命中：1800 万 × 10% 费率 + 未命中 200 万 |
| 月费用（估算） | ¥210 | ≈ ¥38 |
| 节省 | — | 约 82% |

> 实际节省比例取决于固定内容占总输入的比例，以及命中率。固定内容越长、占比越高，收益越大。

---

🛠️ **实战练习**

**步骤：**

1. 取一个你正在用的 Prompt，在 System Prompt 里放一段 1000 Token 以上的固定内容（可以用真实的产品文档或用 Lorem Ipsum 凑）

2. 连续发两次相同请求，对比 `usage` 字段里的 `prompt_cache_hit_tokens`（DeepSeek）或 `cache_read_input_tokens`（Claude）

3. 用以下脚本打印缓存效率：

```javascript
function printCacheStats(usage) {
  // DeepSeek / OpenAI 格式
  if ('prompt_cache_hit_tokens' in usage) {
    const hit = usage.prompt_cache_hit_tokens ?? 0
    const total = usage.prompt_tokens
    console.log(`缓存命中：${hit}/${total} Token（${((hit/total)*100).toFixed(1)}%）`)
  }
  // Claude 格式
  if ('cache_read_input_tokens' in usage) {
    const hit = usage.cache_read_input_tokens ?? 0
    const total = usage.input_tokens + hit + (usage.cache_creation_input_tokens ?? 0)
    console.log(`缓存命中：${hit}/${total} Token（${((hit/total)*100).toFixed(1)}%）`)
  }
}
```

**期望结果**：第二次请求后看到缓存命中率 > 80%。

**进阶挑战**：故意把动态内容插到 System Prompt 中间，观察缓存命中率变为 0，理解"前缀稳定"的重要性。

## 📌 关键结论

- Prompt Caching 通过复用相同前缀的 KV Cache，将缓存命中的 Token 费用降至正常价格的 10%～30%
- **自动缓存**（DeepSeek/OpenAI）：无需改代码，只要固定内容始终在请求最前面
- **手动标记**（Claude）：在内容块上加 `cache_control: { type: "ephemeral" }`
- 核心原则：**固定内容前置，动态内容后置**，任何破坏前缀一致性的改动都会让缓存失效
- 场景适用：长 System Prompt、RAG 文档、Few-shot 示例、多轮对话历史

下一节：[1.17 模型能力评估与选型](/ch1-llm-engineering/)
