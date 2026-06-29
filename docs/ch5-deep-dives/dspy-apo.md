# 5.20 DSPy 与自动化 Prompt 优化

在 [第 6 章](../ch6-prompt-mastery/) 里，你学会了如何手工设计提示词：想清楚任务、给例子、控制输出格式、迭代测试。

但手工调 Prompt 有个根本性的问题：**你的直觉和模型真正响应的内容之间有认知偏差。** 你觉得"这句话更清楚"，模型并不一定表现更好。更糟糕的是，调好一个模型的 Prompt，换个模型可能失效。

这一节介绍另一个思路：**把 Prompt 优化变成可以自动化的程序**。

---

## 问题：手工 Prompt 工程的局限

```
你现在的工作方式：
  1. 想出一个提示词
  2. 测几个例子，感觉不错
  3. 上线
  4. 遇到出问题的 case，手动改提示词
  5. 重复 1-4，希望越来越好

问题：
  ✗ 每次改动都是凭感觉，不知道整体是否在变好
  ✗ 为一个模型调好的 Prompt，换模型要重调
  ✗ 调 Prompt 的"进度"无法沉淀，换人就丢失
  ✗ 规模大了（几十个子任务都要调），人力跟不上
```

---

## DSPy 的核心思想

[DSPy](https://github.com/stanfordnlp/dspy)（Stanford 2023）提出了一套不同的做法：

> **把 Prompt 模板从"你手写的文字"变成"可以被自动优化的参数"。**

类比：深度学习里，你不手写神经网络的权重，你写**架构**，然后用数据和优化器自动找最优权重。DSPy 对 Prompt 做同样的事：你写**程序逻辑**（模块组合），DSPy 用你的数据和评估函数自动找最优指令和 Few-shot 样例。

```
你来做：
  - 定义任务的输入输出签名（signature）："给一段新闻 → 输出情感标签 + 理由"
  - 定义评估指标：情感分类准确率
  - 提供一批标注数据

DSPy 自动做：
  - 尝试不同的指令表述
  - 自动选择最优的 few-shot 例子
  - 测不同的 Prompt 策略（CoT、ReAct 等）
  - 输出在你的评估集上最优的 Prompt 配置
```

---

## 核心概念：Signature、Module、Optimizer

### Signature（签名）

描述"输入什么、输出什么"的约定，不涉及具体的提示词文字：

```python
# Python（DSPy 原生是 Python）
import dspy

class SentimentAnalysis(dspy.Signature):
    """分析新闻的情感倾向"""
    article: str = dspy.InputField(desc="一段新闻文章")
    sentiment: str = dspy.OutputField(desc="情感标签：positive/negative/neutral")
    rationale: str = dspy.OutputField(desc="简要理由")

# DSPy 会自动根据 signature 生成并优化具体的提示词文字
predictor = dspy.ChainOfThought(SentimentAnalysis)
result = predictor(article="今日A股大涨，市场信心明显提振…")
print(result.sentiment)    # "positive"
print(result.rationale)    # "文章描述市场上涨和信心提振，情感偏正面"
```

### Module（模块）

可以组合的 LLM 调用单元，类似神经网络层：

```python
class RAGPipeline(dspy.Module):
    def __init__(self):
        self.retrieve = dspy.Retrieve(k=3)         # 检索模块
        self.generate = dspy.ChainOfThought(       # 生成模块
            "context, question -> answer"
        )

    def forward(self, question):
        docs = self.retrieve(question)
        return self.generate(context=docs.passages, question=question)

rag = RAGPipeline()
answer = rag("公司的退货政策是什么？")
```

### Optimizer（优化器）

自动找到最优 Prompt 配置：

```python
from dspy.teleprompt import BootstrapFewShot, MIPROv2

# BootstrapFewShot：自动从训练数据里选最优 few-shot 例子
optimizer = BootstrapFewShot(metric=accuracy_metric, max_bootstrapped_demos=4)
optimized_rag = optimizer.compile(rag, trainset=train_examples)

# MIPROv2（更强大）：既优化例子选择，也优化指令文字
optimizer = MIPROv2(metric=accuracy_metric)
optimized_rag = optimizer.compile(rag, trainset=train_examples, num_trials=30)
```

---

## 不用 DSPy 也能学的核心思想

DSPy 是 Python 框架，如果你主要用 JavaScript，可以借鉴它的核心思想在自己的系统里实现：

### 思想一：把"评估集"放在优化闭环里

```javascript
// 不是"感觉这个 Prompt 更好"，而是在评估集上量化对比
async function comparePrompts(promptA, promptB, evalSet) {
  const scoreA = await evaluatePrompt(promptA, evalSet)
  const scoreB = await evaluatePrompt(promptB, evalSet)
  console.log(`Prompt A: ${(scoreA * 100).toFixed(1)}%`)
  console.log(`Prompt B: ${(scoreB * 100).toFixed(1)}%`)
  return scoreA > scoreB ? promptA : promptB
}
```

### 思想二：自动 Few-shot 选择

与其手动挑几个例子，让程序帮你从标注数据里选最优的：

```javascript
// 候选例子池（已标注的输入输出对）
const candidateExamples = [
  { input: "这产品质量很好", output: "positive" },
  { input: "快递太慢了", output: "negative" },
  // ... 50 个例子
]

// 方法一：随机采样，测哪个子集分最高
async function findBestFewShot(candidateExamples, evalSet, numShots = 3, trials = 20) {
  let bestScore = 0, bestExamples = []

  for (let t = 0; t < trials; t++) {
    const sampled = sampleN(candidateExamples, numShots)
    const score = await evaluateWithFewShot(sampled, evalSet)
    if (score > bestScore) {
      bestScore = score
      bestExamples = sampled
    }
  }

  return { bestExamples, bestScore }
}

// 方法二：按"最难"选例子（覆盖模型容易搞错的 case）
async function selectHardExamples(candidates, model, evalSet, n = 3) {
  const errors = []
  for (const example of candidates) {
    const pred = await model(example.input)
    if (pred !== example.output) errors.push(example)  // 模型当前答错的
  }
  return errors.slice(0, n)  // 把模型容易错的做进 few-shot
}
```

### 思想三：指令自动生成与筛选

```javascript
// 让 LLM 帮你生成候选指令，然后用评估集选最优
async function generateAndSelectInstructions(taskDescription, evalSet, numCandidates = 5) {
  // 用强模型生成多个候选指令
  const res = await client.chat.completions.create({
    model: MODEL,
    messages: [{
      role: 'user',
      content: `为以下任务生成 ${numCandidates} 种不同表述的系统提示词，每种一段：\n${taskDescription}`
    }]
  })

  const candidates = parseInstructions(res.choices[0].message.content)

  // 在评估集上测每个指令
  const scores = await Promise.all(
    candidates.map(async inst => ({
      instruction: inst,
      score: await evaluateInstruction(inst, evalSet)
    }))
  )

  // 返回最高分的指令
  return scores.sort((a, b) => b.score - a.score)[0]
}
```

---

## 什么时候值得用 DSPy / APO

DSPy 和自动优化不是银弹，有明确的适用范围：

| 适合 | 不适合 |
|-----|-------|
| 有 50+ 条标注数据 | 没有评估集（APO 没有指北针） |
| 有明确的量化指标（准确率/F1/NDCG） | 指标是主观质量（创意、风格） |
| 任务相对固定，会长期运行 | 一次性任务 |
| 需要在多个模型上保持效果 | 只用一个模型，手调够用 |
| Prompt 多、维护成本高 | 单个 Prompt 场景 |

> 💡 **实用判断**：如果你有评估集，每次修改 Prompt 都用它测一下——这就是 APO 的精髓。DSPy 只是把这个过程自动化了。**先建评估集，再谈优化。**

---

## 与 [6.6 迭代与评估方法论](../ch6-prompt-mastery/iteration) 的关系

|  | 手工迭代（6.6）| APO / DSPy |
|--|------------|----------|
| 指导者 | 人的直觉 + 测试集反馈 | 优化算法 + 测试集 |
| 适合规模 | 1-5 个 Prompt，小团队 | 10+ 个 Prompt，需要自动化 |
| 门槛 | 低，随时可以开始 | 需要高质量标注数据 |
| 可解释性 | 高（你知道为什么改） | 低（算法选的，不知道为什么） |
| 速度 | 慢（人工） | 快（但要跑很多次 LLM 调用） |

**建议**：先用 6.6 手工迭代，把评估集建起来，Prompt 质量到瓶颈了再考虑 APO 自动优化。

---

## 🛠️ 实战练习：最小 APO

用你的一个分类/抽取任务，实现一个最简化的自动 Prompt 优化：

1. 准备 30 条标注数据（输入 + 正确输出）：20 条训练集，10 条测试集
2. 写 3 种不同表述的候选指令（自己写，或用 LLM 生成）
3. 用上面的评估脚本，对每种指令在测试集上跑一遍，记录准确率
4. 选出最优指令，再试一下"自动 few-shot 选择"（从训练集里随机抽 3 条 × 5 次，看哪组 few-shot 配合最优指令效果最好）

**期望结果**：找到比你手工写的初版更好的指令+例子组合，并且你能用数字说明"好多少"。

---

## 📌 关键结论

1. 手工 Prompt 调优靠直觉，自动化优化（APO）靠评估数据——评估集是两者的核心
2. DSPy 用"签名+模块+优化器"取代手写 Prompt 字符串，让 Prompt 成为可优化的参数
3. 关键思想可以独立使用：候选指令测评、Few-shot 自动选择、把评估集纳入调优闭环
4. APO 需要标注数据和量化指标，没有评估集就没有方向，先建集
5. 先手工迭代到瓶颈，再引入 APO 自动化——不要一开始就为了"高端"跳过手工阶段

---

下一节：[5.6 MCP·三种能力深入](./mcp-capabilities)
