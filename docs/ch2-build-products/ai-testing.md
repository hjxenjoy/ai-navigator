# 2.17 AI 测试工程

传统软件测试是确定性的：给定输入，输出一定是 X。AI 系统不是——同样的 Prompt，不同调用可能输出不同的答案，而且"对不对"本身也常常是模糊的。

这一节讲如何为 AI 系统建立实用的测试体系。

---

## AI 测试的三层结构

```
第一层：单元测试（快、便宜）
  ├─ 测 Prompt 模板渲染
  ├─ 测工具调用的参数解析
  ├─ 测结构化输出的 Schema 校验
  └─ 不调用真实 LLM，用 mock

第二层：黄金数据集评估（中速、中价）
  ├─ 一批标注好的"输入 → 期望输出"
  ├─ 对比实际输出和期望输出
  └─ 调用真实 LLM，但在 CI 里跑

第三层：线上监控（持续、被动）
  ├─ 生产流量采样，人工抽查
  ├─ 自动指标监控（延迟、错误率、用户反馈）
  └─ 触发告警后人工介入
```

---

## 第一层：不需要 LLM 的单元测试

```javascript
// 1. 测 Prompt 模板渲染
function buildSupportPrompt(language, productName, userQuery) {
  return `你是 ${productName} 的客服助手，请用${language}回复。\n用户问题：${userQuery}`
}

// 普通 Jest 测试，0 成本
test('buildSupportPrompt 包含所有必要信息', () => {
  const prompt = buildSupportPrompt('中文', '我的产品', '如何退款')
  expect(prompt).toContain('我的产品')
  expect(prompt).toContain('中文')
  expect(prompt).toContain('如何退款')
})

// 2. 测结构化输出解析
function parseOrderExtraction(rawOutput) {
  const parsed = JSON.parse(rawOutput)
  if (!parsed.orderId || !parsed.amount) {
    throw new Error('缺少必填字段')
  }
  return parsed
}

test('parseOrderExtraction 拒绝缺字段的输出', () => {
  expect(() => parseOrderExtraction('{"orderId": "123"}')).toThrow()
  expect(() => parseOrderExtraction('{"orderId": "123", "amount": 99}')).not.toThrow()
})

// 3. 测工具调用的参数验证
function validateSearchParams(params) {
  if (!params.query || params.query.trim().length === 0) {
    return { valid: false, error: '查询词不能为空' }
  }
  if (params.limit && (params.limit < 1 || params.limit > 100)) {
    return { valid: false, error: 'limit 必须在 1-100 之间' }
  }
  return { valid: true }
}

test('validateSearchParams 验证参数范围', () => {
  expect(validateSearchParams({ query: '退款', limit: 200 }).valid).toBe(false)
  expect(validateSearchParams({ query: '退款', limit: 10 }).valid).toBe(true)
})
```

---

## 第二层：黄金数据集（Golden Dataset）

黄金数据集是你的测试核心：一批精心准备的"输入 → 期望输出"对，代表最重要的场景。

### 数据集结构

```javascript
// golden-dataset.json（维护在代码库里，随 Prompt 一起版本控制）
const goldenDataset = [
  {
    id: 'refund_simple',
    category: 'customer_support',
    input: { query: '我昨天买的东西想退款怎么办', channel: 'chat' },
    expected: {
      intent: 'refund',
      // 用"包含这些关键点"而不是精确匹配输出文字
      mustContain: ['退款', '7天', '联系'],
      mustNotContain: ['抱歉无法处理', '这不在我们的服务范围'],
      sentiment: 'helpful'
    },
    tags: ['refund', 'critical']  // 标签便于子集过滤
  },
  {
    id: 'order_status',
    category: 'customer_support',
    input: { query: '我的订单什么时候发货', channel: 'chat' },
    expected: {
      intent: 'order_inquiry',
      mustContain: ['订单号', '查询'],
      mustNotContain: [],
      sentiment: 'helpful'
    },
    tags: ['order', 'common']
  },
  // ... 更多案例
]
```

### 评估函数

```javascript
// 不要精确字符串匹配——LLM 输出有合理的变化
function scoreResponse(actual, expected) {
  const scores = {}

  // 关键词覆盖率
  if (expected.mustContain?.length) {
    const covered = expected.mustContain.filter(kw =>
      actual.toLowerCase().includes(kw.toLowerCase())
    )
    scores.keywordCoverage = covered.length / expected.mustContain.length
  }

  // 禁止词检测（0 = 出现了禁止词，1 = 干净）
  if (expected.mustNotContain?.length) {
    const violated = expected.mustNotContain.filter(kw =>
      actual.toLowerCase().includes(kw.toLowerCase())
    )
    scores.safety = violated.length === 0 ? 1 : 0
  }

  // 总分（各维度简单平均）
  const vals = Object.values(scores).filter(v => v !== undefined)
  scores.total = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0

  return scores
}

// 批量评估
async function evaluateDataset(dataset, systemPrompt, modelId = 'claude-haiku-4-5-20251001') {
  const results = []

  for (const testCase of dataset) {
    const res = await client.chat.completions.create({
      model: modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: testCase.input.query }
      ]
    })

    const actual = res.choices[0].message.content
    const scores = scoreResponse(actual, testCase.expected)

    results.push({
      id: testCase.id,
      category: testCase.category,
      tags: testCase.tags,
      scores,
      actual: actual.slice(0, 200),  // 保存前 200 字供人工抽查
    })
  }

  // 汇总
  const avgTotal = results.reduce((s, r) => s + r.scores.total, 0) / results.length
  const failedIds = results.filter(r => r.scores.total < 0.7).map(r => r.id)

  return { avgScore: avgTotal, failedIds, details: results }
}
```

### 数据集管理原则

```
数据集应该：
  ✅ 版本控制（和代码一起提交）
  ✅ 覆盖"关键路径"（用户最常用的 top 20% 功能）
  ✅ 包含边界案例（脏数据、极短输入、语言混用）
  ✅ 反映生产真实分布（从线上日志里采样）

数据集不应该：
  ❌ 只覆盖"正常 happy path"
  ❌ 精确匹配输出字符串（LLM 每次输出有微小变化）
  ❌ 超过 200 条（评估成本高，要精不要多）
```

---

## 在 CI 里跑 Prompt 回归测试

```yaml
# .github/workflows/ai-regression.yml
name: AI Regression Tests

on:
  pull_request:
    paths:
      - 'prompts/**'       # 只在 Prompt 变更时触发
      - 'src/ai/**'

jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci

      - name: Run Golden Dataset Evaluation
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: node scripts/eval-golden.js --threshold 0.85

      - name: Compare with baseline
        run: |
          # 和上一次 main 分支的评估结果对比，降分超过 5% 就报错
          node scripts/compare-eval.js --max-regression 0.05
```

```javascript
// scripts/eval-golden.js
import { evaluateDataset } from '../src/ai/eval.js'
import dataset from '../tests/golden-dataset.json' assert { type: 'json' }
import systemPrompt from '../prompts/support-system.txt' assert { type: 'string' }

const { avgScore, failedIds } = await evaluateDataset(dataset, systemPrompt)

console.log(`平均分：${(avgScore * 100).toFixed(1)}%`)
if (failedIds.length > 0) {
  console.log(`失败用例：${failedIds.join(', ')}`)
}

const threshold = parseFloat(process.argv[process.argv.indexOf('--threshold') + 1] || 0.85)
if (avgScore < threshold) {
  console.error(`评估分数 ${avgScore.toFixed(2)} 低于阈值 ${threshold}，CI 失败`)
  process.exit(1)
}
```

---

## LLM-as-Judge：用 AI 评估 AI

对于"语义质量"（答案是否有帮助、是否准确），规则匹配不够，可以用另一个 LLM 来打分：

```javascript
async function judgeWithLLM(question, expectedBehavior, actualAnswer) {
  const res = await client.chat.completions.create({
    model: 'claude-sonnet-4-6',  // 用比被测模型更强的模型做评审
    messages: [{
      role: 'user',
      content: `你是一个严格的 AI 回复质量评审员。

用户问题：${question}
期望行为：${expectedBehavior}
实际回复：${actualAnswer}

请评分（0-10）并说明理由。
只输出 JSON：{"score": 数字, "reason": "理由", "pass": true/false}`
    }],
    response_format: { type: 'json_object' }
  })

  return JSON.parse(res.choices[0].message.content)
}

// 使用
const judgment = await judgeWithLLM(
  '如何申请退款',
  '应该给出清晰的退款步骤，态度友好，包含联系方式',
  actualResponse
)
console.log(`分数: ${judgment.score}/10, 通过: ${judgment.pass}`)
```

> ⚠️ **LLM-as-Judge 的局限**：评审 LLM 本身也有偏差——它倾向于给"听起来自信"的回答高分，而不一定是"实际正确"的。用它评估**语气和格式**比评估**事实准确性**更可靠。事实类问题还是要用人工标注的黄金答案。

---

## 测试数据来源：从生产日志采样

```javascript
// 用生产流量补充测试集（去隐私后）
async function sampleFromProductionLogs(logs, sampleSize = 50) {
  // 1. 按场景分层采样（不要全是"最常见的"，要覆盖尾部）
  const byCategory = groupBy(logs, l => l.intent)
  const sampled = []

  for (const [cat, items] of Object.entries(byCategory)) {
    const n = Math.max(1, Math.floor(sampleSize * (items.length / logs.length)))
    sampled.push(...randomSample(items, n))
  }

  // 2. 脱敏（移除用户 ID、手机号、邮箱等）
  return sampled.map(log => ({
    input: sanitizePII(log.userMessage),
    actualOutput: sanitizePII(log.aiResponse),
    rating: log.userThumbsUp ?? null,  // 如果有用户反馈则带上
    timestamp: log.timestamp
  }))
}
```

---

## 测试成本控制

```
CI 里运行全量评估很贵，几个节省方法：

1. 分层：PR 只跑"关键"标签（~20条），每日完整评估跑全量（~200条）
2. 用小模型评估：被测用大模型，但评估脚本用 haiku/flash（便宜 10x）
3. 缓存：相同输入的模型输出可以缓存 24h（同一个 Prompt 版本内）
4. 并行：Promise.allSettled() 并发跑，别串行等待
```

```javascript
// 并行评估，限制并发
async function evaluateParallel(dataset, systemPrompt, concurrency = 5) {
  const results = []
  for (let i = 0; i < dataset.length; i += concurrency) {
    const batch = dataset.slice(i, i + concurrency)
    const batchResults = await Promise.allSettled(
      batch.map(tc => evaluateSingle(tc, systemPrompt))
    )
    results.push(...batchResults.map((r, j) => ({
      ...batch[j],
      result: r.status === 'fulfilled' ? r.value : { error: r.reason.message }
    })))
  }
  return results
}
```

---

## 🛠️ 实战练习：建立 10 条黄金数据集

选你当前项目的一个 AI 功能，完成：

1. 写出 10 条测试用例（输入 + `mustContain` + `mustNotContain`），涵盖：
   - 3 条"正常路径"
   - 3 条"边界情况"（空输入、很长的输入、语言混用）
   - 2 条"容易出错的 case"（你之前遇到过的 bug）
   - 2 条"对抗性输入"（用户试图绕过规则）

2. 实现 `scoreResponse()` 和 `evaluateDataset()` 并在本地跑通

3. 记录当前分数作为 baseline

**期望结果**：你有一个数字化的质量基线，下次改 Prompt 后能立刻知道"变好了还是变差了"。

---

## 📌 关键结论

1. AI 测试分三层：不调 LLM 的单元测试 → 黄金数据集评估 → 线上监控，成本和深度依次递增
2. 黄金数据集是核心资产——用 `mustContain/mustNotContain` 做柔性匹配，不要精确字符串对比
3. Prompt 改动要和数据集评估放进同一个 CI 流程，量化"是否变好了"
4. LLM-as-Judge 评估语气和格式比评估事实更可靠，事实准确性还是要人工标注
5. 先建 10-20 条高质量测试用例，比 200 条低质量的更有价值

---

下一节：[2.18 数据飞轮：用生产数据持续改进](./data-flywheel)
