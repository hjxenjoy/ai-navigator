# 1.14 结构化输出的可靠实践

在真实产品里，你经常需要 AI 输出一个 **可以直接用代码处理的结构**：一份 JSON、一张表、一个固定格式的摘要。这比让模型"自由发挥"要难控制得多。这一节专门讲怎么把结构化输出做到足够可靠。

## 三种方式，可靠性递增

### 方式一：Prompt 里约定格式

最简单，但最脆弱。

```javascript
// 容易跑偏：模型可能加注释、加 ```json 包裹、字段名大小写变化
{ role: "system", content: "请只输出 JSON，格式为 {name: string, score: number}" }
```

问题：模型偶尔会加 ````json` 包裹、加注释、字段名不稳定。约 5-15% 的请求会解析失败，生产里不能接受。

### 方式二：`response_format: json_object`

强制模型输出**合法的 JSON 字符串**（能 `JSON.parse` 不报错），但不约束字段。

```javascript
const res = await client.chat.completions.create({
  model: MODEL,
  messages: [
    { role: "system", content: '提取关键信息，输出 JSON，包含 name、score、tags 字段' },
    { role: "user", content: text }
  ],
  response_format: { type: "json_object" }
})

const data = JSON.parse(res.choices[0].message.content)
```

> ⚠️ 使用 `json_object` 时，System Prompt 或用户消息里必须有"JSON"这个词，否则部分模型会报错。

### 方式三：JSON Schema 约束（最可靠）

部分模型支持传入 JSON Schema，让模型在**生成时就被约束**在 schema 范围内，字段不会缺、类型不会错。

```javascript
// OpenAI / DeepSeek 的 structured outputs（如果支持）
const res = await client.chat.completions.create({
  model: MODEL,
  messages: [...],
  response_format: {
    type: "json_schema",
    json_schema: {
      name: "extraction_result",
      strict: true,
      schema: {
        type: "object",
        properties: {
          name:  { type: "string" },
          score: { type: "number", minimum: 0, maximum: 100 },
          tags:  { type: "array", items: { type: "string" } }
        },
        required: ["name", "score", "tags"],
        additionalProperties: false
      }
    }
  }
})
```

> 💡 `strict: true` 会在模型层面做约束，而不仅仅是在结果上校验。支持这个参数的模型，解析失败率接近零。

---

## 解析失败时怎么办：重试 + 错误反馈

就算用了 `json_object`，偶尔还是会碰到字段缺失或类型错误。**不要直接抛错给用户，用自动重试+错误反馈修复。**

```javascript
import { z } from 'zod'

// 用 Zod 定义期望的结构（类型安全 + 验证）
const ResultSchema = z.object({
  name:  z.string(),
  score: z.number().min(0).max(100),
  tags:  z.array(z.string())
})

async function extractWithRetry(text, maxRetries = 2) {
  const baseMessages = [
    { role: "system", content: '提取关键信息，只输出 JSON，包含 name(string)、score(0-100 number)、tags(string[]) 字段' },
    { role: "user", content: text }
  ]

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const messages = attempt === 0
      ? baseMessages
      : [
          ...baseMessages,
          { role: "assistant", content: lastRawOutput },
          { role: "user", content: `你的输出校验失败：${lastError}。请重新输出，只输出合法 JSON，不要其他内容。` }
        ]

    const res = await client.chat.completions.create({
      model: MODEL, messages,
      response_format: { type: "json_object" }
    })

    const raw = res.choices[0].message.content
    lastRawOutput = raw

    try {
      const parsed = JSON.parse(raw)
      const validated = ResultSchema.parse(parsed)  // Zod 校验
      return validated
    } catch (err) {
      lastError = err.message
      if (attempt === maxRetries) throw new Error(`结构化提取失败（重试 ${maxRetries} 次）：${lastError}`)
    }
  }
}
```

> 💡 **为什么把错误内容反馈给模型？** 直接告诉模型"你上次的输出哪里不对"，比重新发一次同样的请求修复率高得多。这个技巧适用于所有需要模型输出精确格式的场景。

---

## Schema 设计原则

**让 Schema 尽量简单**，越复杂越容易出问题：

| 建议 | 原因 |
|-----|------|
| 字段用 snake_case，避免中文键名 | 模型对英文键名更稳定 |
| 数值用 number 而非 string，避免 "100" vs 100 混淆 | 省去类型转换，也减少校验逻辑 |
| Optional 字段设默认值，不要全用 `required: false` | 字段缺失时你代码里不用到处判断 `undefined` |
| 嵌套不超过 3 层 | 越深越容易串结构 |
| 避免 union type（A \| B）| 模型不擅长"这个字段可能是字符串也可能是数字" |
| 枚举值用 enum，不要靠 Prompt 描述 | `"category": { "type": "string", "enum": ["A","B","C"] }` 比写"category 只能是 A/B/C"可靠 |

---

## 流式输出 vs 结构化输出

它们通常**不能同时用**：流式是逐 Token 返回，结构化需要等完整 JSON 再解析。

> 实践做法：**结构化提取不用流式**，直接等完整结果。如果场景需要流式显示给用户，可以这样分工：
> - 先流式展示"正在处理…"或部分文本给用户看
> - 后台同时或之后跑一次结构化提取，写回数据库

---

## 生产里的可接受错误率

| 方式 | 典型解析失败率 | 适合场景 |
|-----|------------|---------|
| 纯 Prompt 约定格式 | 5-15% | 绝对不适合生产 |
| json_object 模式 | 1-3% | 加重试后可用于中低风险 |
| JSON Schema strict | <0.1% | 高频高要求场景 |
| json_object + Zod 重试（最多 2 次） | <0.3% | 大多数产品场景够用 |

> ⚠️ 不同模型的可靠性差距很大。本地小模型（Ollama 7B 以下）的结构化输出失败率可能高达 10%+，要多加重试或用规则后处理兜底。

---

## 🛠️ 实战练习：从文本里可靠地抽结构

取一批真实文本（产品评论、简历片段、邮件等），实现一个抽取 pipeline：

1. 先用 Prompt 约定格式跑 10 条，记录解析失败率
2. 换成 `json_object` 模式重新跑，对比失败率
3. 加 Zod 校验 + 最多 2 次重试，看最终成功率
4. 记录每条的 token 消耗，算出重试的额外成本

**期望结果**：你亲眼看到三种方式的可靠性差异，并建立"结构化场景优先用 json_object + Zod 重试"的直觉。

**进阶挑战**：在重试消息里加一条规则——如果 `score` 字段超出 0-100 范围，额外提示"score 必须在 0 到 100 之间"，看修复率是否提升。

---

## 📌 关键结论

1. 纯 Prompt 约定格式在生产里不够可靠，必须配合 `response_format` 或 JSON Schema
2. `json_object` 保证 JSON 合法但不保证字段，要加 Zod 校验兜底
3. 失败时把错误反馈给模型让它自修正，比盲目重试有效得多（最多 2 次）
4. Schema 设计越简单越好：snake_case 键名、数值用 number、枚举用 enum
5. 结构化输出和流式通常互斥，产品里要分开处理

---

下一节：[第 2 章 · 构建 AI 产品](/ch2-build-products/)
