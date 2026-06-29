# 2.18 数据飞轮：用生产数据持续改进

AI 产品有一个传统软件没有的独特优势：**你的用户在使用产品的同时，也在为你生产改进数据**。问题是，这些数据大多数团队没有系统地收集和利用。

数据飞轮（Data Flywheel）就是把这个过程闭环的方法：产品跑得越久，数据越多，AI 越好，产品越好，用户越多，数据又越多。

---

## 飞轮的三个环节

```
      ┌─────────────────────────────────────┐
      │                                     ▼
  产品运行          ──────►         收集用户信号
  （更多用户）                   （点赞/踩、重试、放弃）
      ▲                                     │
      │                                     ▼
  AI 质量提升       ◄──────         分析 + 改进
  （Prompt / 微调）               （找 bad case，优化）
      └─────────────────────────────────────┘
```

每一个环节都要有意识地设计，飞轮才能转起来。

---

## 环节一：收集用户信号

### 显式反馈（用户主动告诉你）

```javascript
// 在 AI 回复旁显示反馈按钮
function AIResponseFeedback({ messageId, response }) {
  async function submitFeedback(rating, comment) {
    await fetch('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({
        messageId,
        rating,      // 'good' | 'bad'
        comment,     // 可选的文字原因
        response,    // 保存 AI 实际输出
        timestamp: Date.now()
      })
    })
  }

  return (
    <div>
      <button onClick={() => submitFeedback('good')}>👍</button>
      <button onClick={() => submitFeedback('bad')}>👎</button>
    </div>
  )
}
```

### 隐式信号（行为数据，比显式反馈更真实）

```javascript
// 追踪用户行为信号
const IMPLICIT_SIGNALS = {
  // 用户立刻重新提问 → 上一条回复没帮到他
  immediate_retry: {
    detect: (events) => {
      const pairs = []
      for (let i = 0; i < events.length - 1; i++) {
        const curr = events[i], next = events[i+1]
        if (curr.type === 'ai_response' && next.type === 'user_message') {
          const gap = next.timestamp - curr.timestamp
          if (gap < 10_000) pairs.push({ message: curr, signal: 'immediate_retry' })
        }
      }
      return pairs
    },
    weight: -0.8  // 强烈负向信号
  },

  // 用户复制了 AI 的输出 → 认为这个有用
  copy_output: {
    detect: (events) => events.filter(e => e.type === 'copy' && e.source === 'ai_response'),
    weight: +0.9
  },

  // 用户放弃对话（超过 5 分钟没有回复）
  conversation_abandon: {
    detect: (events) => {
      // 找到最后一条 AI 回复后，超过 5 分钟没有用户消息
      // ...
    },
    weight: -0.5
  },

  // 用户完成了目标操作（如：问完退款后真的发起了退款申请）
  goal_completed: {
    detect: (events) => events.filter(e => e.type === 'conversion_event'),
    weight: +1.0  // 最强正向信号
  }
}

// 服务端记录
async function logInteraction(sessionId, userMessage, aiResponse, metadata = {}) {
  await db.interactions.insert({
    sessionId,
    userMessage,
    aiResponse,
    systemPromptVersion: metadata.promptVersion,
    modelId: metadata.model,
    latencyMs: metadata.latency,
    timestamp: new Date()
  })
}
```

---

## 环节二：分析数据，找到改进点

### 自动找 Bad Case

```javascript
// 从数据库里自动挖掘"有问题的回复"
async function findBadCases(since = '7 days ago') {
  const badCases = []

  // 1. 有负向反馈的
  const thumbsDown = await db.query(`
    SELECT i.*, f.comment
    FROM interactions i
    JOIN feedback f ON i.id = f.interaction_id
    WHERE f.rating = 'bad'
      AND i.timestamp > NOW() - INTERVAL '7 days'
    ORDER BY i.timestamp DESC
    LIMIT 100
  `)
  badCases.push(...thumbsDown.map(r => ({ ...r, source: 'explicit_feedback' })))

  // 2. 紧跟着有 immediate_retry 的
  const retries = await db.query(`
    SELECT i1.*
    FROM interactions i1
    JOIN interactions i2 ON i1.session_id = i2.session_id
    WHERE i2.timestamp - i1.timestamp < INTERVAL '10 seconds'
      AND i1.role = 'assistant'
      AND i2.role = 'user'
      AND i1.timestamp > NOW() - INTERVAL '7 days'
    LIMIT 100
  `)
  badCases.push(...retries.map(r => ({ ...r, source: 'implicit_retry' })))

  // 3. 模型调用出错的（timeout、parse error 等）
  const errors = await db.query(`
    SELECT * FROM interactions
    WHERE error IS NOT NULL
      AND timestamp > NOW() - INTERVAL '7 days'
    LIMIT 50
  `)
  badCases.push(...errors.map(r => ({ ...r, source: 'error' })))

  return deduplicateBy(badCases, 'id')
}
```

### 用 LLM 自动分类 Bad Case

```javascript
// 对收集到的 bad case 自动归类，找规律
async function categorizeBadCases(badCases) {
  const BATCH_SIZE = 20
  const categorized = []

  for (let i = 0; i < badCases.length; i += BATCH_SIZE) {
    const batch = badCases.slice(i, i + BATCH_SIZE)
    const caseSummaries = batch.map((c, idx) =>
      `Case ${idx + 1}:\n用户: ${c.userMessage.slice(0, 100)}\nAI: ${c.aiResponse.slice(0, 100)}\n来源: ${c.source}`
    ).join('\n\n---\n\n')

    const res = await client.chat.completions.create({
      model: 'claude-haiku-4-5-20251001',
      messages: [{
        role: 'user',
        content: `分析以下 AI 客服的失败案例，对每个 case 归类失败原因。
类别包括：信息缺失、理解错误、拒绝过度、格式问题、事实错误、其他。
每个 case 输出一行 JSON：{"caseIndex": 数字, "category": "类别", "insight": "一句话说明问题"}

案例：\n${caseSummaries}`
      }]
    })

    // 解析结果
    const lines = res.choices[0].message.content.trim().split('\n')
    for (const line of lines) {
      try {
        const { caseIndex, category, insight } = JSON.parse(line)
        categorized.push({ ...batch[caseIndex - 1], category, insight })
      } catch { /* 忽略解析失败的行 */ }
    }
  }

  // 统计分布
  const distribution = groupBy(categorized, c => c.category)
  return {
    total: categorized.length,
    distribution: Object.fromEntries(
      Object.entries(distribution).map(([k, v]) => [k, v.length])
    ),
    details: categorized
  }
}
```

---

## 环节三：把数据转化为改进

### 改进路径一：更新 Prompt（最快）

```javascript
// 根据 bad case 分析，自动生成 Prompt 改进建议
async function suggestPromptImprovements(systemPrompt, badCases, analysis) {
  const topIssues = Object.entries(analysis.distribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat, count]) => `${cat}（${count} 次）`)

  const worstCases = badCases.slice(0, 5).map(c =>
    `用户: "${c.userMessage}"\nAI: "${c.aiResponse.slice(0, 150)}"\n问题: ${c.insight}`
  ).join('\n\n')

  const res = await client.chat.completions.create({
    model: 'claude-sonnet-4-6',
    messages: [{
      role: 'user',
      content: `你是一个 AI 系统优化专家。
当前系统提示词：
\`\`\`
${systemPrompt}
\`\`\`

最近 7 天的主要失败原因：${topIssues.join('、')}

典型失败案例：
${worstCases}

请给出 3 条具体的提示词修改建议，每条包含：
1. 要修改/添加的具体内容
2. 预期解决的问题
格式：JSON 数组 [{suggestion, targetIssue}]`
    }],
    response_format: { type: 'json_object' }
  })

  return JSON.parse(res.choices[0].message.content)
}
```

### 改进路径二：构建微调数据集

```javascript
// 把"好的交互"转化为微调训练数据
async function buildFineTuneDataset(since = '30 days ago') {
  // 筛选高质量交互（有正向反馈，或用户完成目标的）
  const goodInteractions = await db.query(`
    SELECT i.*
    FROM interactions i
    LEFT JOIN feedback f ON i.id = f.interaction_id
    WHERE (f.rating = 'good' OR i.goal_completed = true)
      AND i.timestamp > NOW() - INTERVAL '30 days'
      AND LENGTH(i.ai_response) > 50  -- 过滤掉太短的回复
    ORDER BY RANDOM()
    LIMIT 500
  `)

  // 格式化为微调所需的对话格式
  return goodInteractions.map(row => ({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: row.user_message },
      { role: 'assistant', content: row.ai_response }
    ]
  }))
}

// 导出为 JSONL 格式（微调平台通常需要此格式）
function exportToJSONL(dataset, outputPath) {
  const lines = dataset.map(d => JSON.stringify(d))
  fs.writeFileSync(outputPath, lines.join('\n'))
  console.log(`导出 ${dataset.length} 条训练数据到 ${outputPath}`)
}
```

### 改进路径三：扩充黄金数据集

```javascript
// 把有价值的 bad case 转化为测试用例
async function convertToGoldenCase(badCase) {
  // 让 LLM 生成这个 case 的"理想回复"
  const idealResponse = await client.chat.completions.create({
    model: 'claude-sonnet-4-6',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT + '\n\n（请给出最理想的回复）' },
      { role: 'user', content: badCase.userMessage }
    ]
  })

  return {
    id: `prod_${badCase.id}`,
    category: badCase.category,
    source: 'production_bad_case',
    input: { query: badCase.userMessage },
    expected: {
      // 从理想回复里提取关键词
      mustContain: await extractKeyPhrases(idealResponse.choices[0].message.content),
      mustNotContain: await extractAntiPatterns(badCase.aiResponse)
    },
    tags: ['production', badCase.category]
  }
}
```

---

## 飞轮度量：怎么知道飞轮在转

```javascript
// 每周生成飞轮健康报告
async function weeklyFlywheelReport() {
  const report = {
    period: 'last 7 days',

    // 数据收集
    totalInteractions: await db.count('interactions WHERE timestamp > NOW() - INTERVAL 7 DAYS'),
    feedbackRate: await db.query(`
      SELECT COUNT(f.id)::float / COUNT(i.id) as rate
      FROM interactions i LEFT JOIN feedback f ON i.id = f.interaction_id
      WHERE i.timestamp > NOW() - INTERVAL '7 days'
    `),

    // 质量信号
    positiveRate: await db.query('SELECT rating, COUNT(*) FROM feedback WHERE created_at > NOW() - INTERVAL 7 DAYS GROUP BY rating'),
    retryRate: await calcRetryRate(),
    goalCompletionRate: await calcGoalCompletionRate(),

    // 改进进度
    badCasesResolved: await db.count('bad_cases WHERE resolved = true AND resolved_at > NOW() - INTERVAL 7 DAYS'),
    promptVersion: await getCurrentPromptVersion(),
    goldenDatasetSize: await db.count('golden_dataset'),
  }

  return report
}
```

---

## 最小可行飞轮（从哪里开始）

不需要一次把所有东西都搭好，一步步来：

```
第 1 周：收集
  → 在 AI 回复旁加上 👍/👎 按钮
  → 把每次 AI 调用记录到数据库（带时间戳、用户消息、AI 回复）

第 2 周：分析
  → 每天看一遍 👎 的回复，记下"为什么不好"
  → 统计负反馈的类型分布

第 3 周：改进
  → 针对最多的那类问题，更新 Prompt
  → 把 3-5 个 bad case 加进黄金数据集
  → 用评估脚本验证改进是否有效

第 4 周起：循环
  → 上面三步变成常规节奏（每周或每两周一轮）
```

> 💡 **类比**：数据飞轮就像在产品里安装了一个自我诊断系统——不是等用户投诉再修，而是持续收集信号、找规律、系统地改进。传统软件靠 bug 报告；AI 产品靠数据飞轮。

---

## 🛠️ 实战练习：最小数据飞轮

在你当前的 AI 功能上实现最简版飞轮：

1. 在 AI 回复旁加 👍/👎 按钮，把反馈存到数据库（或 JSON 文件）
2. 模拟 30 条交互记录（15 条正面，15 条负面，加一些原因备注）
3. 写脚本统计负反馈的分类（人工分或让 LLM 帮你分）
4. 针对最多的一类问题，修改 Prompt，并用你的黄金数据集（来自 2.17 练习）验证是否改进

**期望结果**：你的 Prompt 修改有数据支撑（"改动后黄金数据集从 78% 提升到 85%"），而不是凭感觉。

---

## 📌 关键结论

1. 数据飞轮的核心：生产数据 → 分析 bad case → 改进（Prompt/微调/测试集）→ 产品变好 → 更多数据
2. 隐式信号（立刻重试、复制输出、放弃对话）比显式点赞/踩更真实、更多量
3. 用 LLM 自动分类 bad case，找高频问题类型，比人工逐条分析高效 10x
4. 改进路径按速度排：更新 Prompt（最快）> 扩充测试集（中）> 构建微调数据集（最慢）
5. 最小可行飞轮：只需要一个反馈按钮 + 一张记录表 + 每周看一次，就能转起来

---

下一节：[2.11 实战项目：知识库问答 Agent](./capstone)
