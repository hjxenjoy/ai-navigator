# 5.22 合成数据生成：用 AI 造训练数据

[5.13 微调·全流程与数据准备](./finetuning-workflow) 讲了微调的每一步，并反复强调"数据质量决定成败"。但它没有回答一个关键问题：**高质量训练数据从哪里来？**

人工标注是传统答案——让人逐条写输入、标输出。问题是：慢（每条要几分钟）、贵（每条要几美元）、一旦任务变了就得重来。1000 条数据，人工做要几周、花几万元。

**合成数据**是 2024-2025 年最重要的 AI 工程实践之一。Meta、Google、Anthropic 都在大量使用它来训练和微调模型。核心思路是：**用强模型批量生成训练数据，让弱模型从中学习**。同样的 1000 条，10 分钟，成本降 99%。

> 💡 **类比**：合成数据就像请一位经验丰富的老师先写出大量"参考答案"，再让学生（小模型）从这些参考答案中学习。老师（强模型）的能力通过这批答案传递给了学生——这正是业内常说的"知识蒸馏"的精髓。

---

## 核心挑战：质量控制

合成数据不是让强模型随意生成就行的。主要有三个陷阱：

**幻觉污染**：强模型也会犯错，错误答案混入训练集，小模型会把错误一并学走。一条错误数据的破坏力远大于一条数据的收益。

**分布坍塌**：如果 seed（种子）数据太少、太单一，强模型生成的变体会高度相似——表面上是 1000 条，实际上是同一句话换了 1000 种说法，覆盖不了真实场景的多样性。

**格式不一致**：微调平台对数据格式要求严格（ChatML 的 JSONL），一个字段缺失或类型错误就会导致整批数据被拒绝。

> ⚠️ **常见误解**：以为合成数据只是"让 GPT 多生成点例子"。真正的合成数据流程有精心设计的 seed、严格的质量过滤，以及人工验证集——少了任何一环，生成的数据都可能是噪声。

---

## 三步流程：从 Seed 到数据集

### 第一步：准备高质量 Seed 数据

Seed 是整个流程的质量天花板。强模型只能在 seed 的框架内变化——seed 质量差，再多的变体也没用。

**Seed 的要求**：
- 数量：至少 10–50 条，人工精心编写
- 覆盖性：覆盖所有重要子类型。以客服为例：退款、投诉、咨询、技术问题各类型都要有 seed
- 质量：每条都必须是你真正想让模型学会的"最佳示例"——格式规范、答案准确、风格一致

Seed 的格式就是标准的 ChatML JSONL（参见 [5.13 微调·全流程与数据准备](./finetuning-workflow)）：

```jsonl
{"messages":[{"role":"system","content":"你是客服助手，判断用户意图并分类"},{"role":"user","content":"我的订单三天没到，能退款吗？"},{"role":"assistant","content":"退款申请"}]}
{"messages":[{"role":"system","content":"你是客服助手，判断用户意图并分类"},{"role":"user","content":"你们的产品和竞品相比有什么优势？"},{"role":"assistant","content":"产品咨询"}]}
{"messages":[{"role":"system","content":"你是客服助手，判断用户意图并分类"},{"role":"user","content":"App 一直崩溃，怎么办？"},{"role":"assistant","content":"技术问题"}]}
```

---

### 第二步：生成变体

把每条 seed 扩展成多条变体。关键在于让强模型理解"类型不变，措辞和场景变"——而不是简单地改几个词。

```javascript
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * 把一条 seed 样本扩展成 numVariants 条变体
 * @param {Object} seedExample - {messages: [{role, content}, ...]}
 * @param {number} numVariants - 生成几条变体
 * @returns {Promise<Object[]>} - 变体数组，格式同 seedExample
 */
async function generateVariants(seedExample, numVariants = 10) {
  const userMessage = seedExample.messages.find(m => m.role === 'user').content
  const assistantMessage = seedExample.messages.find(m => m.role === 'assistant').content
  const systemMessage = seedExample.messages.find(m => m.role === 'system')?.content ?? ''

  const prompt = `下面是一条训练样本示例：

用户输入："${userMessage}"
标准答案："${assistantMessage}"

请生成 ${numVariants} 条**新的**训练样本，要求：
1. 意图类别必须和原样本完全一致（即答案仍为"${assistantMessage}"）
2. 用户输入的措辞、场景、表达方式各不相同，覆盖不同年龄、不同语气、不同具体情况
3. 不要重复原样本的措辞

以 JSON 数组输出，格式：
[
  {"user": "...", "assistant": "..."},
  ...
]

只输出 JSON 数组，不要其他文字。`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2048,
    temperature: 0.9, // 高温度，增加多样性
    messages: [{ role: 'user', content: prompt }]
  })

  const raw = response.content[0].text.trim()

  // 解析模型输出的 JSON 数组
  let variants
  try {
    variants = JSON.parse(raw)
  } catch {
    // 模型有时会在 JSON 前后加文字，尝试提取
    const match = raw.match(/\[[\s\S]*\]/)
    if (!match) return []
    variants = JSON.parse(match[0])
  }

  // 还原为标准 ChatML 格式
  return variants.map(v => ({
    messages: [
      ...(systemMessage ? [{ role: 'system', content: systemMessage }] : []),
      { role: 'user', content: v.user },
      { role: 'assistant', content: v.assistant }
    ]
  }))
}
```

---

### 第三步：质量过滤

生成的数据不能全收，必须经过过滤，淘汰不合格的样本。

```javascript
/**
 * 对单条样本做质量过滤
 * 返回 {pass: boolean, reason: string}
 */
function filterByFormat(sample) {
  const messages = sample?.messages
  if (!Array.isArray(messages) || messages.length < 2) {
    return { pass: false, reason: '格式错误：messages 不是数组或长度不足' }
  }

  const user = messages.find(m => m.role === 'user')
  const assistant = messages.find(m => m.role === 'assistant')

  if (!user || !assistant) {
    return { pass: false, reason: '缺少 user 或 assistant 字段' }
  }

  const answerWords = assistant.content.trim().split(/\s+/).length
  if (answerWords < 2) {
    return { pass: false, reason: `回答太短（${answerWords} 词）` }
  }
  if (answerWords > 500) {
    return { pass: false, reason: `回答太长（${answerWords} 词），超出目标场景` }
  }

  return { pass: true, reason: 'ok' }
}

/**
 * 用 LLM 对一条样本打质量分（0-10）
 * 分数 < 7 的视为低质量，过滤掉
 */
async function scoreWithLLM(client, sample, taskDescription) {
  const user = sample.messages.find(m => m.role === 'user').content
  const assistant = sample.messages.find(m => m.role === 'assistant').content

  const prompt = `你是数据质量评估员。

任务描述：${taskDescription}

待评估的训练样本：
用户输入：${user}
模型回答：${assistant}

请从以下维度给这条样本打分（总分 10 分）：
- 回答是否准确、符合任务要求（4分）
- 用户输入是否真实自然、接近线上场景（3分）
- 格式是否规范（3分）

只输出一个数字（0-10），不要其他内容。`

  const response = await client.messages.create({
    model: 'claude-haiku-4-5', // 用快速模型打分，降低成本
    max_tokens: 10,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }]
  })

  const score = parseFloat(response.content[0].text.trim())
  return isNaN(score) ? 0 : score
}
```

> 💡 **类比**：LLM 打质量分就像用一位 AI 助教批改作业。它不能替代真人，但能快速过滤掉明显不合格的（空答案、答非所问、格式乱），让真人只需要复查边界情况。

---

## 完整 Pipeline

把三步组装成一个可复用的 Pipeline 类：

```javascript
import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

class SyntheticDataPipeline {
  constructor({ taskDescription, variantsPerSeed = 10, minScore = 7, outputPath = 'synthetic_data.jsonl' }) {
    this.taskDescription = taskDescription
    this.variantsPerSeed = variantsPerSeed
    this.minScore = minScore
    this.outputPath = outputPath
    this.buffer = [] // 中间结果缓冲区，防止失败丢失数据
  }

  /**
   * 从 seed 数据生成并过滤，返回通过质量关的样本
   * @param {Object[]} seeds - seed 数组（ChatML 格式）
   * @param {number} targetCount - 目标样本总数
   * @returns {Promise<Object[]>} - 过滤后的样本数组
   */
  async generateFromSeed(seeds, targetCount) {
    const results = []
    let generated = 0
    let passed = 0

    console.log(`开始生成合成数据，目标：${targetCount} 条，seed：${seeds.length} 条`)

    for (const seed of seeds) {
      // 每条 seed 生成 variantsPerSeed 条变体
      const variants = await generateVariants(seed, this.variantsPerSeed)
      generated += variants.length

      for (const variant of variants) {
        // 格式过滤（廉价，先跑）
        const formatCheck = filterByFormat(variant)
        if (!formatCheck.pass) continue

        // LLM 质量打分（有成本，在格式通过后再跑）
        const score = await scoreWithLLM(client, variant, this.taskDescription)
        if (score < this.minScore) continue

        results.push(variant)
        this.buffer.push(variant)
        passed++

        // 每 50 条保存一次中间结果，避免失败丢失数据
        if (this.buffer.length % 50 === 0) {
          this._saveBuffer()
          console.log(`进度：已生成 ${generated} 条，通过过滤 ${passed} 条`)
        }

        if (results.length >= targetCount) break
      }

      if (results.length >= targetCount) break
    }

    // 最终保存
    this._saveBuffer()
    console.log(`完成！总生成 ${generated} 条，最终通过 ${passed} 条，通过率 ${(passed / generated * 100).toFixed(1)}%`)
    return results
  }

  _saveBuffer() {
    const lines = this.buffer.map(s => JSON.stringify(s)).join('\n')
    fs.writeFileSync(this.outputPath, lines, 'utf-8')
  }
}

// ── 使用示例 ──────────────────────────────────────────────
async function main() {
  // 1. 加载你手写的 seed 数据（每行一个 JSON）
  const seedLines = fs.readFileSync('seeds.jsonl', 'utf-8').trim().split('\n')
  const seeds = seedLines.map(line => JSON.parse(line))

  // 2. 初始化 pipeline
  const pipeline = new SyntheticDataPipeline({
    taskDescription: '客服意图分类：将用户消息分类为退款申请、产品咨询、技术问题、投诉建议之一',
    variantsPerSeed: 20,    // 每条 seed 生成 20 个变体
    minScore: 7,            // LLM 质量分低于 7 的丢弃
    outputPath: 'train.jsonl'
  })

  // 3. 生成（从 seeds 扩展到目标数量）
  const dataset = await pipeline.generateFromSeed(seeds, 500)
  console.log(`数据集已保存到 train.jsonl，共 ${dataset.length} 条`)
}

main().catch(console.error)
```

运行前需要准备 `seeds.jsonl` 文件（手写的 seed 数据）并设置 `ANTHROPIC_API_KEY` 环境变量。

---

## 专项技巧：领域知识注入

对于垂直领域（法律、医疗、金融），合成数据还需要额外注意：

**在 Seed 里包含领域专业术语**：如果 seed 全是大白话，生成的变体也只会是大白话，无法覆盖专业场景（"合同违约金条款"、"诉讼时效"这类表达）。

**在 Prompt 里提供领域背景**：在 `generateVariants` 的 prompt 里加一段领域上下文——"本任务面向法律场景，用户可能使用法律术语，请覆盖"。

**明确写出"不能生成什么"**：在 prompt 里加"错误示例"和禁止行为——如医疗场景里"不能生成具体药物剂量建议"。这能显著减少幻觉污染。

```javascript
// 领域知识注入示例（在 generateVariants 的 prompt 里追加）
const domainContext = `
领域背景：本任务面向法律客服场景。
用户可能使用的专业术语包括：违约金、诉讼时效、合同解除、仲裁条款等。
请确保生成的变体覆盖专业与非专业两种表达方式。
禁止生成：具体法律建议（只做意图分类，不给法律意见）。
`
```

---

## 数量 vs 质量的权衡

这是微调领域最容易走弯路的地方：

**500 条高质量 > 5000 条低质量**。这是被反复验证的黄金法则。低质量数据不只是"没用"，而是**负作用**——教坏比没教更糟。

**验证集必须用真实人工数据**。合成数据用来训练没问题，但验证集如果也是合成的，就相当于"用 AI 检验 AI"，无法反映模型在真实用户场景的表现。

**推荐分配**：

| 数据集 | 来源 | 比例 |
|--------|------|------|
| 训练集 | 合成数据（经过过滤）| 80% |
| 验证集 | 真实用户数据或人工标注 | 20% |

> ⚠️ **常见误解**：验证集越大越好。其实验证集只需要几十到几百条，但必须真实。真实的 50 条验证集，比合成的 500 条更有说服力。

---

## 🛠️ 实战练习

选定一个具体任务，走完完整流程：

**推荐任务 A：客服意图分类**（适合初学者）
- 4 个类别：退款申请、产品咨询、技术问题、投诉建议

**推荐任务 B：代码注释生成**（适合有编程基础的）
- 给 JavaScript 函数生成简洁的 JSDoc 注释

**步骤**：

1. 为你选定的任务手写 **10 条 seed 样本**，每个子类型至少 2 条，存成 `seeds.jsonl`

2. 运行完整 Pipeline，目标生成 **200 条**数据（`targetCount: 200`）

3. 观察并记录：
   - 总共生成了多少条原始变体？
   - 格式过滤淘汰了多少？
   - LLM 质量打分淘汰了多少？
   - 最终通过多少条？通过率是多少？
   - 质量分的分布如何（大部分在 7-9 分，还是集中在 7-8？）

4. 抽取 20 条随机样本，**人工逐条检查**：生成的变体是否真实自然？有没有明显的幻觉或格式错误？

**期望结果**：经过过滤后得到至少 150 条质量分 ≥ 7 的训练数据，通过率约 75%。如果通过率低于 50%，说明 seed 质量不足或 prompt 需要优化，回到第一步改 seed。

**进阶挑战**：把最终数据集接入 [5.14 微调·用国产平台云端微调](./finetuning-cloud)，在阿里百炼上跑一次真实微调，对比微调前后的准确率。

---

## 📌 关键结论

1. 合成数据的本质是"知识蒸馏"——用强模型的能力通过高质量数据传递给弱模型，成本比人工标注低 99%
2. 质量控制是核心：格式校验 + LLM 质量打分 + 人工抽检三层过滤，缺一不可
3. Seed 是质量天花板：seed 不够多样，生成的变体再多也会分布坍塌；seed 有错误，错误会被放大
4. 验证集必须来自真实用户或人工标注，不能用合成数据做验证集——否则无法判断模型是否真的有效

---

下一节：[5.13 微调·全流程与数据准备](./finetuning-workflow)
