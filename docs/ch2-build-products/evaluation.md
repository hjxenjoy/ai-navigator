# 2.5 AI 系统的评估方法

大多数人做 AI 功能的流程是：写 Prompt → 测一下 → 感觉还行 → 上线。

这是不够的。**没有评估，你无法知道你的改动是真的变好了还是变差了。**

## 为什么评估很重要

改了一个 Prompt，你靠什么判断它变好了？
- 手动测了 3 个例子感觉好一点？→ 可能是幸存者偏差
- 上线后用户反馈好了？→ 太慢了，而且可能有其他因素

**Eval（评估）** 是让这个判断变得可靠和可重复的方法。

---

## 什么是 Ground Truth

Ground Truth 是"正确答案"的基准。

在评估 AI 系统时，你需要有一批样本，每个样本都知道"正确的输出是什么"，然后让 AI 跑这些样本，看它有多少是对的。

```
样本: "退款流程是什么？"
Ground Truth: "退款需要在购买后 7 天内申请，3-5 个工作日到账"
AI 输出: "退款需要在7天内提交申请，一般3至5天退回。"
→ 对比，判断是否正确
```

---

## LLM-as-Judge

当输出不是对/错这么简单（比如写的文章好不好，回答是否有帮助），用人工打分成本太高。

**LLM-as-Judge** 是用另一个（通常更强的）AI 模型来评判输出质量。

```javascript
async function evaluateResponse(question, aiAnswer, groundTruth) {
  const judgePrompt = `你是一个严格的评估者。
  
用户问题：${question}
参考答案：${groundTruth}
AI 回答：${aiAnswer}

请评估 AI 回答的质量（1-5分）：
1分：完全错误或有害
3分：部分正确，有明显缺失
5分：完全正确，表达清晰

只输出一个数字。`

  const response = await client.chat.completions.create({
    model: MODEL,  // 用便宜的模型评估，DeepSeek 已经足够便宜
    max_tokens: 10,
    messages: [{ role: "user", content: judgePrompt }]
  })
  
  return parseInt(response.choices[0].message.content)
}
```

---

## Benchmark 是什么

Benchmark 是一套标准化的测试集，用来对比不同模型或不同版本的能力。

你经常会看到：
- **MMLU**（Massive Multitask Language Understanding）：覆盖 57 个学科的多选题，测通用知识
- **HumanEval**：OpenAI 出的代码生成测试，给函数签名和注释，让模型写出实现
- **GSM8K**（Grade School Math 8K）：8000 道小学数学应用题，测多步骤推理

这些是评估模型本身的基准。对你更有用的是**为你的具体场景建立自己的评估集**。

---

## 为你的项目建立评估体系

**第一步：收集真实的测试案例**

从用户真实提问里取样，或者手动创建覆盖不同情况的测试案例。

```javascript
const testCases = [
  {
    input: "怎么申请退款",
    expectedKeywords: ["7天", "退款", "申请"],
    shouldNotContain: ["联系客服"]  // 不应该让用户打电话
  },
  // ... 更多测试案例
]
```

**第二步：自动化运行评估**

```javascript
import OpenAI from "openai"

// 默认 DeepSeek 云端；本地 Ollama 切换方式见 1.4 节注释
const client = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY
})
const MODEL = "deepseek-v4-flash"   // 本地可换 "qwen2.5:14b" 或 "gemma4:12b"

// 封装 AI 调用
async function askAI(question) {
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 512,
    // OpenAI 兼容协议里，system 提示作为 messages 数组的第一条
    messages: [
      { role: "system", content: "你是一个客服助手，根据公司政策回答用户问题。退款政策：购买后7天内可申请，3-5个工作日退回。" },
      { role: "user", content: question }
    ]
  })
  return response.choices[0].message.content
}

async function runEvaluation(testCases) {
  const results = []
  for (const tc of testCases) {
    const response = await askAI(tc.input)
    const passed = tc.expectedKeywords.every(kw => response.includes(kw))
      && !tc.shouldNotContain.some(kw => response.includes(kw))
    results.push({ ...tc, response, passed })
  }
  
  const passRate = results.filter(r => r.passed).length / results.length
  console.log(`通过率: ${(passRate * 100).toFixed(1)}%`)
  results.filter(r => !r.passed).forEach(r => {
    console.log(`\n❌ 失败: "${r.input}"`)
    console.log(`   AI回答: ${r.response.slice(0, 100)}...`)
  })
  return results
}
```

**第三步：每次改动后都跑评估**

改了 Prompt？改了检索策略？跑一遍评估，看数字变好了还是变差了。

---

## Precision 和 Recall（精准率和召回率）

这两个词在评估检索系统（RAG）时很常用：

- **Precision（精准率）**：你找到的结果里，有多少是真正相关的？
- **Recall（召回率）**：所有相关结果里，你找到了多少？

```
真实相关文档: [A, B, C, D, E]
你的系统找到: [A, B, F, G]（F和G不相关）

Precision = 2/4 = 50%（找到的4个里，2个真正相关）
Recall    = 2/5 = 40%（5个相关文档里，找到了2个）
```

两者是有取舍的：提高精准率往往会降低召回率，反之亦然。

---

---

## 🛠️ 实战练习：给你的 AI 功能建立第一个评估集

**目标**：10 分钟内，给你现有的某个 AI 功能建立一个最小的评估体系。

**第一步**：选一个你最常用的 AI 功能（比如客服问答、代码生成、文档总结）

**第二步**：想出 5 个典型的测试问题，包括：
- 2 个"正常问题"（正常情况下 AI 应该能答对的）
- 2 个"边界问题"（AI 可能答错或答偏的）
- 1 个"故意刁难"（用户可能提的奇怪问题）

**第三步**：把上面的完整代码（含 `askAI` 函数）复制到本地，替换成你自己的 System Prompt 和测试案例，运行一次，看通过率是多少。

**判断标准**：通过率 ≥ 80% 是可接受水平，< 60% 说明 Prompt 有明显问题需要优化。

---

## 📌 关键结论

1. 没有评估，你无法可靠地判断改动是否有效
2. 建立自己的测试集，自动化运行，每次改动后对比数字
3. LLM-as-Judge 是评估开放式输出质量的高效方法
4. RAG 系统重点看 Precision 和 Recall

---

下一节：[2.6 生产环境的坑](./production)
