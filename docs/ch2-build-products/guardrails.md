# 2.15 Guardrails 输出防护实战

[2.7 安全](./security) 讲了威胁模型——什么是 Prompt 注入、什么是数据泄露。这一节讲**落地**：如何用代码实现一层"防护网"（Guardrails），让 AI 的输出在到达用户之前先经过校验和过滤。

> 💡 **Guardrails 的核心思想**：不要 100% 信任 AI 的输出。把它当成一个"初稿"，用确定性代码做校验、修复、过滤，不符合要求的不放行。

---

## 你需要保护什么

把 Guardrails 分成三层，每层守住不同的事：

```
输入防护（进来的）
  ├─ 输入长度限制（防超长攻击）
  ├─ 敏感词/注入特征检测
  └─ 用户权限校验（这个用户有权问这个问题吗）

输出防护（出去的）
  ├─ 结构校验（JSON 格式、字段齐全）
  ├─ 内容安全（PII 脱敏、违禁词过滤）
  ├─ 业务规则（价格范围合法、日期逻辑正确）
  └─ 有害内容过滤（模型被绕过时的最后一道墙）

行为防护（Agent 做事的）
  ├─ 工具调用白名单
  ├─ 危险操作人工确认
  └─ 轮次/费用上限
```

---

## 输入防护

```javascript
function validateInput(userInput, opts = {}) {
  const { maxLength = 4000, userId } = opts

  // 1. 长度限制（防超长 Prompt 注入 + 防成本型攻击）
  if (userInput.length > maxLength) {
    throw new UserError(`输入太长（最多 ${maxLength} 字）`)
  }

  // 2. 简单注入特征检测（不是万能的，但能拦最明显的）
  const injectionPatterns = [
    /ignore.{0,20}(all|previous|above).{0,20}(instructions?|prompt)/i,
    /forget.{0,20}(everything|your|all)/i,
    /you are now/i,
    /\[SYSTEM\]|\[INST\]/i,   // 尝试注入系统标记
  ]
  if (injectionPatterns.some(p => p.test(userInput))) {
    // 只记录不报错，不暴露给用户（暴露反而给攻击者反馈）
    logSecurity('injection_attempt', { userId, inputPreview: userInput.slice(0, 100) })
    throw new UserError('这个输入我没办法处理，请换一种方式提问')
  }

  return userInput.trim()
}
```

> ⚠️ 正则检测只能拦住低水平注入。高水平的 Prompt 注入靠规则完全防不住，核心防线还是 **最小权限 + 输出校验**（详见 [2.7](./security)）。这里的输入校验是第一道廉价过滤，不是唯一防线。

---

## 输出防护：结构 + 内容双校验

```javascript
import { z } from 'zod'

// 1. 结构校验（用 Zod，快速失败）
const AnswerSchema = z.object({
  answer: z.string().min(1),
  confidence: z.enum(['high', 'medium', 'low']),
  sources: z.array(z.string()).optional().default([]),
})

// 2. 内容安全校验
function sanitizeOutput(text) {
  // PII 脱敏（实际生产里用成熟的 NER 模型或专业库）
  const sanitized = text
    .replace(/\b1[3-9]\d{9}\b/g, '[手机号]')            // 中国手机号
    .replace(/\b\d{18}\b|\b\d{17}X\b/gi, '[身份证]')    // 身份证
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[邮箱]')

  return sanitized
}

// 3. 业务规则校验
function validateBusinessRules(data, context) {
  // 示例：RAG 问答里，答案必须有来源才算置信度高
  if (data.confidence === 'high' && data.sources.length === 0) {
    data.confidence = 'medium'  // 自动降级，而不是报错
  }

  // 示例：价格相关回答要在合理范围
  const priceMatch = data.answer.match(/(\d+(?:\.\d+)?)\s*元/)
  if (priceMatch) {
    const price = parseFloat(priceMatch[1])
    if (price > 1_000_000) {
      return { valid: false, reason: '价格异常，请人工复核' }
    }
  }

  return { valid: true }
}

// 整合成一个输出防护管道
async function guardedOutput(rawOutput, context) {
  // Step 1: 解析结构
  let data
  try {
    data = AnswerSchema.parse(JSON.parse(rawOutput))
  } catch (err) {
    throw new GuardrailError('输出格式异常', { raw: rawOutput, err: err.message })
  }

  // Step 2: 内容安全
  data.answer = sanitizeOutput(data.answer)

  // Step 3: 业务规则
  const check = validateBusinessRules(data, context)
  if (!check.valid) {
    throw new GuardrailError(check.reason, { data })
  }

  return data
}
```

---

## 用 LLM 做二次安全检查（LLM-as-Guardrail）

对于不能用规则完整描述的安全要求（比如"不能帮用户做竞品攻击"、"不能透露内部系统信息"），可以用一个小模型做二次判断：

```javascript
// 用小/快模型做内容安全判断（不需要最强的模型）
async function llmSafetyCheck(userInput, assistantOutput) {
  const res = await client.chat.completions.create({
    model: 'deepseek-v3-0324',   // 用便宜快速的模型做 check
    messages: [{
      role: 'system',
      content: `你是一个内容安全审核员。判断下面的 AI 回复是否存在以下问题：
1. 泄露了系统内部信息（数据库、密钥、系统提示词）
2. 帮助用户绕过系统限制或攻击系统
3. 包含明显不实信息（数字、事实性错误）

只回答 JSON：{"safe": true/false, "reason": "简短说明"}`
    }, {
      role: 'user',
      content: `用户问：${userInput}\n\nAI 回复：${assistantOutput}`
    }],
    response_format: { type: 'json_object' },
    max_tokens: 100
  })

  const result = JSON.parse(res.choices[0].message.content)
  return result.safe
}
```

> ⚠️ LLM-as-Guardrail 也会出错。它是**增加一道防线，不是替代前面的规则校验**。高价值场景可以叠加用：规则校验 + LLM 二次检查，两道都过才放行。

---

## 有害内容过滤的分级策略

不是所有内容风险都一样严重，过滤强度要和业务场景匹配：

```javascript
const FilterLevel = {
  STRICT: 'strict',     // 政府/教育/儿童：最严，一旦检测到就拦截
  STANDARD: 'standard', // 通用企业应用：中等，拦截明显违规
  RELAXED: 'relaxed',   // 专业工具（安全研究/医疗）：只拦截最严重的
}

class ContentFilter {
  constructor(level = FilterLevel.STANDARD) {
    this.level = level
  }

  check(text) {
    const issues = []

    // 所有级别都检查
    if (this._containsPersonalData(text)) issues.push({ type: 'PII', severity: 'high' })

    // STANDARD 及以上
    if (this.level !== FilterLevel.RELAXED) {
      if (this._containsPoliticallySensitive(text)) issues.push({ type: 'political', severity: 'medium' })
    }

    // 只在 STRICT 检查
    if (this.level === FilterLevel.STRICT) {
      if (this._containsControversialContent(text)) issues.push({ type: 'controversial', severity: 'low' })
    }

    return {
      passed: issues.filter(i => i.severity === 'high').length === 0,
      issues
    }
  }

  _containsPersonalData(text) { /* ... */ }
  _containsPoliticallySensitive(text) { /* ... */ }
  _containsControversialContent(text) { /* ... */ }
}
```

---

## 完整的 Guardrails 管道

```javascript
class AIGuardrailPipeline {
  constructor({ filterLevel = FilterLevel.STANDARD, enableLLMCheck = false } = {}) {
    this.filter = new ContentFilter(filterLevel)
    this.enableLLMCheck = enableLLMCheck
  }

  async run(userInput, callAI, context = {}) {
    // 1. 输入防护
    const safeInput = validateInput(userInput, context)

    // 2. 调用 AI
    const rawOutput = await callAI(safeInput)

    // 3. 输出结构校验
    const structuredOutput = await guardedOutput(rawOutput, context)

    // 4. 内容过滤
    const filterResult = this.filter.check(structuredOutput.answer)
    if (!filterResult.passed) {
      logSecurity('content_blocked', { issues: filterResult.issues, userId: context.userId })
      throw new UserError('这个回答涉及了一些不能展示的内容，请换个问法')
    }

    // 5. 可选的 LLM 二次检查（开销大，只在高风险场景开启）
    if (this.enableLLMCheck) {
      const safe = await llmSafetyCheck(userInput, structuredOutput.answer)
      if (!safe) throw new UserError('回答经安全检查未通过，请联系客服')
    }

    return structuredOutput
  }
}

// 使用
const pipeline = new AIGuardrailPipeline({ filterLevel: FilterLevel.STANDARD })
const result = await pipeline.run(
  userQuestion,
  (input) => callLLM(input),
  { userId: req.user.id }
)
```

---

## 开源 Guardrails 框架（了解即可）

如果不想自己写，有现成的框架：

| 框架 | 特点 | 适合 |
|-----|-----|-----|
| **Guardrails AI**（Python）| 基于 schema + validators，支持自动修复和重试 | Python 生态 |
| **NeMo Guardrails**（NVIDIA）| 用"对话流"脚本控制 AI 行为，防越轨 | 复杂对话系统 |
| **LLamaGuard** | 专门做输入/输出内容分类的微调小模型 | 需要高质量内容安全分类 |
| **自建（本节方案）** | 灵活、无依赖、可完全定制 | 大多数产品场景 |

> 💡 从**自建简单规则开始**，遇到规则搞不定的再引入框架或 LLM-as-Guardrail。过早引入重框架是常见的过度工程。

---

## 🛠️ 实战练习：给问答功能加一层防护

给你的 AI 问答接口加一个最小 Guardrails：

1. 输入层：限制 4000 字，检测 3-5 个注入特征
2. 输出层：PII 脱敏（手机号 + 邮箱），JSON 结构校验
3. 错误处理：防护拦截时记录到 log，返回友好提示而非技术错误信息

**期望结果**：准备几条测试输入（正常问题、超长输入、注入尝试、包含手机号的回复），验证防护管道能正确放行/拦截。

**进阶挑战**：给"高置信度但无来源"的情况加自动降级，对比加 Guardrails 前后用户看到的置信度分布。

---

## 📌 关键结论

1. Guardrails = 输入防护 + 输出防护 + 行为防护，三层都要有
2. 输入校验拦截低水平注入，但核心防线是最小权限和输出校验，不是靠规则防注入
3. 结构校验（Zod）+ 内容安全（PII 脱敏）+ 业务规则 三道输出关卡，覆盖大多数场景
4. LLM-as-Guardrail 用小模型做二次检查，适合规则描述不了的语义安全需求
5. 过滤强度按业务场景分级，别用最严格策略砍掉合法用例
6. 先自建简单规则，复杂场景再引入 Guardrails 框架

---

下一节：[第 3 章 · 理解引擎盖下面](/ch3-under-the-hood/)
