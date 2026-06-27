# 1.1 Token 与上下文：AI 的"工作内存"

## 为什么这节很重要

很多 Agent 失控的问题，最终都能追溯到上下文管理出了问题。搞清楚 Token 和上下文，是做好 AI 工程的基础。

---

## Token 的实际影响

你在 API 里设置 `max_tokens`，在付费账单里看到 token 用量，这些都在说同一件事。

**计费方式**

几乎所有 LLM API 都按 Token 计费，分两部分：
- **输入 Token**（你发给 AI 的所有内容）
- **输出 Token**（AI 生成的回复）

通常输出 Token 比输入 Token 贵 3-5 倍。

> 💡 **实践提示**：如果你在 Agent 任务里不断把大量文件塞进上下文，成本会比你想象的高得多。

---

## 上下文窗口的本质

上下文窗口是 AI 每次处理时能"看到"的全部内容的上限。

一个完整的对话上下文包含：

```
System Prompt（系统提示）
    +
历史对话消息（之前所有的来回）
    +
当前你的消息
    +
工具调用的结果（如果有 Tool Use）
    ‖
= 总 Token 数，不能超过上下文窗口上限
```

**当超出上下文窗口会发生什么？**

不同情况下处理方式不同：
- **API 调用**：直接报错，你需要自己裁剪
- **Claude Code 等工具**：会自动压缩/摘要历史对话（这就是 Context Compression）
- **效果影响**：即使没有报错，当内容接近上限时，AI 对早期内容的"注意力"也会下降

---

## Context Compression 是什么

当上下文太长，AI 工具会自动压缩——把早期的对话总结成摘要，丢掉原始内容。

**这会带来问题：**
- 早期设置的细节可能被压缩掉
- AI 对项目早期决策的记忆变得模糊
- 这是长对话里 Agent 开始"忘事"的主要原因

**怎么应对：**
- 重要的信息放在 System Prompt 里（它通常被保留）
- 复杂任务分成多个独立对话，不要用一个对话做所有事
- 用外部文件/数据库存储需要持久化的信息

---

## KV Cache 是什么（简单了解）

当你多次发送包含相同 System Prompt 的请求，服务端会缓存这部分的计算结果，下次遇到相同内容时直接复用，节省时间和费用。

这就是 **KV Cache（键值缓存）**。

对你的实践影响：如果你的 System Prompt 很长但很固定，它会被缓存，实际上是便宜的。

---

## 实际的上下文大小参考

| 模型 | 上下文窗口 | 大约能放多少中文 |
|-----|-----------|--------------|
| Claude 3.5 Sonnet | 200k Token | ~10 万汉字 |
| GPT-4o | 128k Token | ~6 万汉字 |
| Gemini 2.0 | 1M Token | ~50 万汉字 |

> ⚠️ 上下文大不代表全部内容都被"认真处理"。研究显示，LLM 对上下文中间部分的关注度会下降，开头和结尾的内容被记得更好（俗称"中间迷失"问题）。

---

## 🛠️ 实践练习

用你熟悉的 Node.js，写一个函数来估算一段文本的 Token 数：

```javascript
// 使用 Anthropic 的 tokenizer（或者用这个粗略估算）
// 中文：1 汉字 ≈ 1.5 Token
// 英文：1 单词 ≈ 1.3 Token

function estimateTokens(text) {
  const chineseChars = (text.match(/[一-龥]/g) || []).length
  const otherChars = text.length - chineseChars
  return Math.ceil(chineseChars * 1.5 + otherChars * 0.3)
}
```

---

## 📌 关键结论

1. Token 是 AI 处理和计费的基本单位，输出 Token 比输入贵
2. 上下文窗口 = AI 的工作内存，超出就会"忘事"
3. 重要信息放 System Prompt，复杂任务分多个对话
4. 大上下文 ≠ 所有内容都被认真处理

---

下一节：[1.2 系统性 Prompt 工程](./prompt-engineering)
