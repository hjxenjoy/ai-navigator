# 2.19 Batch API：用异步批处理降低 50% 成本

> 🕐 内容截至 2026-07｜涉及版本：GPT-5.4 / GPT-5.4 mini

假设你手上有 10 万条用户评论，需要逐条生成摘要或打情感标签。如果一条条同步调 API：

- **慢**：串行调用，10 万条 × 平均 1 秒 = 接近 28 小时
- **贵**：用的是正常价格的 token
- **易超限流**：连续高并发触发 Rate Limit，还得写重试逻辑

这类场景不需要实时结果——你可以"今天下单、明天取货"。Batch API 就是为此设计的。

---

## 什么是 Batch API

OpenAI 和 Anthropic 都提供 Batch API，核心逻辑是一样的：

1. 把大量请求打包成一个文件（`.jsonl` 格式）
2. 上传文件，提交 Batch Job
3. 系统在后台异步处理，约 **24 小时内**返回结果
4. 你定期轮询状态，完成后下载结果文件

代价：等待时间变长（从秒级变成最多 24 小时）。
回报：**价格直接打五折**，同样的任务省一半钱。

> 💡 **类比**：同步 API 是打车——你等在路边，车来了马上走。Batch API 是拼车顺风车——你预约明天的行程，司机把你和其他乘客的路线合并安排，但票价便宜得多。

---

## 适用 vs 不适用

| 场景 | 适合 Batch API？ | 原因 |
|------|----------------|------|
| 批量文章摘要 | ✅ | 可以等，量大 |
| 批量情感分类 | ✅ | 离线任务，天然异步 |
| 批量生成 Embedding | ✅ | 最常见用例之一 |
| 数据清洗 / 打标签 | ✅ | 非实时 |
| 实时聊天回复 | ❌ | 用户等不了 24 小时 |
| 流式响应 | ❌ | Batch 不支持流式 |
| 延迟 < 1 秒的场景 | ❌ | 用同步 API |

> ⚠️ **常见误解**：Batch API 不是"并发更高的同步 API"，它是异步的——你提交后**不等结果**，去干别的事，结果好了再回来取。

---

## 成本对比

| 方式 | 价格（以 GPT-5.4 为例） | 响应时间 |
|------|----------------------|---------|
| 同步 API（标准价） | input: $2.50 / 1M tokens | 秒级 |
| Batch API | input: $1.25 / 1M tokens | ≤ 24 小时 |
| 节省 | **50%** | 换时间换价格 |

Anthropic Claude 的 Batch API 同样提供 50% 折扣。

---

## 完整代码示例（Node.js）

以下示例用 OpenAI Batch API 批量摘要文章，完整可运行。

### 第一步：准备请求文件

Batch API 要求把所有请求写成 `.jsonl` 文件，每行一个 JSON 对象。

```javascript
// prepare-batch.mjs
import fs from "fs"

// 模拟 10 条文章（实际场景可能是 10 万条）
const articles = [
  "OpenAI 今日宣布推出 GPT-5，据称在推理能力上大幅领先前代...",
  "苹果公司在 WWDC 发布了 Apple Intelligence，将 AI 功能深度整合进 iOS...",
  "谷歌 DeepMind 的 AlphaFold 3 能预测几乎所有生物分子的结构...",
  // ... 更多文章
]

const lines = articles.map((article, i) => {
  return JSON.stringify({
    custom_id: `article-${i}`,          // 你自定义的 ID，用于匹配结果
    method: "POST",
    url: "/v1/chat/completions",
    body: {
      model: "gpt-5.4-mini",            // 批处理通常用小模型降成本
      messages: [
        {
          role: "user",
          content: `请用一句话总结以下文章：\n\n${article}`
        }
      ],
      max_tokens: 100
    }
  })
})

fs.writeFileSync("batch-input.jsonl", lines.join("\n"))
console.log(`已生成 ${lines.length} 条请求，写入 batch-input.jsonl`)
```

### 第二步：提交 Batch Job

```javascript
// submit-batch.mjs
import OpenAI from "openai"
import fs from "fs"

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

async function submitBatch() {
  // 1. 上传 .jsonl 文件
  console.log("上传请求文件...")
  const file = await client.files.create({
    file: fs.createReadStream("batch-input.jsonl"),
    purpose: "batch"
  })
  console.log("文件上传完成，file_id:", file.id)

  // 2. 创建 Batch Job
  const batch = await client.batches.create({
    input_file_id: file.id,
    endpoint: "/v1/chat/completions",
    completion_window: "24h"            // 最长等待时间
  })

  console.log("Batch Job 已提交！")
  console.log("batch_id:", batch.id)
  console.log("状态:", batch.status)   // 初始状态是 "validating"

  // 保存 batch_id，后续轮询时用
  fs.writeFileSync("batch-id.txt", batch.id)
}

submitBatch().catch(console.error)
```

### 第三步：轮询状态

```javascript
// check-batch.mjs
import OpenAI from "openai"
import fs from "fs"

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

async function checkAndDownload() {
  const batchId = fs.readFileSync("batch-id.txt", "utf8").trim()

  // 轮询，每 30 秒检查一次
  while (true) {
    const batch = await client.batches.retrieve(batchId)
    console.log(`[${new Date().toLocaleTimeString()}] 状态: ${batch.status}`)
    console.log(`  完成: ${batch.request_counts.completed} / ${batch.request_counts.total}`)

    if (batch.status === "completed") {
      console.log("✅ 全部完成！开始下载结果...")
      await downloadResults(batch.output_file_id)
      break
    }

    if (batch.status === "failed" || batch.status === "cancelled") {
      console.error("❌ Batch 失败:", batch.errors)
      break
    }

    // 等 30 秒再查
    await new Promise(resolve => setTimeout(resolve, 30_000))
  }
}

async function downloadResults(outputFileId) {
  // 下载结果文件
  const fileContent = await client.files.content(outputFileId)
  const text = await fileContent.text()

  // 解析 .jsonl 结果
  const results = text
    .trim()
    .split("\n")
    .map(line => JSON.parse(line))

  // 整理成 id -> 摘要 的映射
  const summaries = {}
  for (const result of results) {
    const id = result.custom_id
    const summary = result.response.body.choices[0].message.content
    summaries[id] = summary
  }

  fs.writeFileSync("batch-output.json", JSON.stringify(summaries, null, 2))
  console.log(`已将 ${Object.keys(summaries).length} 条摘要写入 batch-output.json`)
}

checkAndDownload().catch(console.error)
```

运行顺序：

```bash
export OPENAI_API_KEY="sk-..."

node prepare-batch.mjs   # 生成 batch-input.jsonl
node submit-batch.mjs    # 上传并提交，拿到 batch_id
node check-batch.mjs     # 轮询直到完成，下载结果
```

---

## 批量 Embedding 场景

生成大量 Embedding 是 Batch API 最高频的用例之一——比如为 10 万篇文章建向量索引。

```javascript
// batch-embedding.mjs
// 准备 Embedding 请求的 .jsonl
import fs from "fs"

const texts = [
  "如何退款？",
  "配送需要几天？",
  "商品质量有问题怎么办？",
  // ... 大量文本
]

const lines = texts.map((text, i) =>
  JSON.stringify({
    custom_id: `text-${i}`,
    method: "POST",
    url: "/v1/embeddings",
    body: {
      model: "text-embedding-3-small",
      input: text
    }
  })
)

fs.writeFileSync("embed-input.jsonl", lines.join("\n"))
console.log(`准备了 ${lines.length} 条 Embedding 请求`)

// 后续提交、轮询、下载流程与上面完全相同
// 结果中 result.response.body.data[0].embedding 即为向量
```

> 💡 **类比**：同步 Embedding 是一个快递员一次送一个包裹。Batch Embedding 是把所有包裹交给物流中心，他们统一安排车辆批量派送——单件成本低得多。

---

🛠️ 实战练习

**场景**：你有 1000 条产品描述，需要批量生成 50 字以内的摘要。

**具体步骤**：

1. 准备测试数据（可以用循环生成假数据）：

```javascript
// generate-test-data.mjs
import fs from "fs"

const products = Array.from({ length: 1000 }, (_, i) => ({
  id: `product-${i}`,
  description: `这是第 ${i + 1} 号产品，具有优秀的性能和耐用性，适合日常使用。材质为高品质合金，重量 ${200 + i}g，颜色可选黑色或银色。保修期 2 年。`
}))

const lines = products.map(p =>
  JSON.stringify({
    custom_id: p.id,
    method: "POST",
    url: "/v1/chat/completions",
    body: {
      model: "gpt-5.4-mini",
      messages: [{
        role: "user",
        content: `请用 50 字以内总结以下产品描述：\n${p.description}`
      }],
      max_tokens: 80
    }
  })
)

fs.writeFileSync("products-batch.jsonl", lines.join("\n"))
console.log("生成完毕，共", lines.length, "条")
```

2. 按上面的代码流程提交 Batch Job，等待完成后下载结果

**期望结果**：
- `batch-output.json` 中有 1000 条摘要，键为 `product-0` 到 `product-999`
- 统计 token 消耗，与同步调用价格对比（Batch 价格应为标准价的 50%）

**成本估算**（以 gpt-5.4-mini 为例，价格 input $0.75 / output $4.50 每 1M tokens）：
- 每条请求约 100 input tokens + 30 output tokens
- 1000 条：100,000 input + 30,000 output tokens
- 同步价格：约 $0.21
- Batch 价格：约 **$0.11**，省了一半

---

## 📌 关键结论

1. **Batch API 适合"可以等"的大批量任务**：摘要、分类、Embedding、数据清洗——只要不需要实时结果，都应该考虑 Batch API。

2. **成本直接减半**：OpenAI 和 Anthropic 的 Batch API 均提供 50% 折扣，10 万条请求的成本节省非常可观。

3. **流程三步走**：上传 `.jsonl` 文件 → 提交 Batch Job 拿 `batch_id` → 轮询状态等完成后下载结果文件。

4. **`custom_id` 是关键**：结果文件的顺序不保证与输入一致，必须依赖 `custom_id` 来匹配输入和输出。

下一节：[2.20 Prompt 版本管理：把 Prompt 当代码来管](./prompt-management)
