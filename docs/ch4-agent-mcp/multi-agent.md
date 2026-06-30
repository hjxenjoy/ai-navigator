# 4.6 多 Agent 协作

当单个 Agent 搞不定一个任务时，多 Agent 协作是答案——但它也带来了新的复杂性。

---

## 什么时候需要多 Agent

✅ **任务可以并行**：代码审查 + 测试 + 文档可以同时进行  
✅ **上下文不够用**：单个 Agent 的上下文装不下整个任务  
✅ **需要专业分工**：不同子任务需要不同的指令和工具  
✅ **需要相互检验**：一个 Agent 生成，另一个 Agent 审查  

❌ **不需要多 Agent 的场景**：任务本身是顺序的，并行不了；任务简单，拆分只会增加复杂度

> ⚠️ **常见误解**：多 Agent 不是"更强的 AI"，是"更多的 AI"。每个 Agent 还是同一个模型，你增加的是并行度和上下文隔离，不是单个模型的能力。

---

## 三种常见架构

### 架构一：Orchestrator - Subagent（最常见）

一个 Orchestrator 负责全局，拆分任务、分配给 Subagent、汇总结果：

```
Orchestrator（总协调者）
├── 理解整体任务
├── 拆成子任务
├── 并行或串行分配给 Subagent
└── 汇总结果返回给用户

Subagent A        Subagent B        Subagent C
（代码生成）      （代码审查）      （写测试）
```

适合：有明确子任务的复杂任务（写代码、写报告、数据分析）

---

### 架构二：Pipeline（流水线）

Agent A 的输出作为 Agent B 的输入，串行处理，每个 Agent 只专注一个环节：

```
原始文档 → [Agent A: 提取要点] → [Agent B: 翻译] → [Agent C: 格式化] → 最终输出
```

适合：需要多步转化的任务，每步有明确的输入和输出格式

---

### 架构三：投票/辩论（Ensemble）

多个独立 Agent 对同一个问题给出答案，最后通过投票或辩论得出最终结论：

```
问题 → Agent A（答案1）
     → Agent B（答案2）  → 投票/汇总 → 最终答案
     → Agent C（答案3）
```

适合：高风险决策、需要避免单点偏差（如医疗诊断建议、代码安全审查）

---

## 代码实现

以 Orchestrator-Subagent 为例，用 Anthropic SDK 实现并行 Agent：

```javascript
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

// 单个 Subagent 的执行函数
async function runSubagent(role, task, context) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: `你是一个专业的${role}。只负责完成分配给你的具体任务，不要超出范围。`,
    messages: [
      {
        role: 'user',
        content: `背景信息：\n${context}\n\n你的任务：\n${task}`
      }
    ]
  })
  return response.content[0].text
}

// Orchestrator：并行调度多个 Subagent
async function orchestrate(userRequest) {
  // 第一步：让 Orchestrator 拆解任务
  const planResponse = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: '你是一个任务规划专家，把用户请求拆解成3个并行子任务，用JSON格式返回。',
    messages: [{ role: 'user', content: userRequest }]
  })

  const plan = JSON.parse(planResponse.content[0].text)
  // plan = [
  //   { role: "前端工程师", task: "设计组件接口" },
  //   { role: "后端工程师", task: "设计 API 接口" },
  //   { role: "测试工程师", task: "列出测试用例" }
  // ]

  // 第二步：并行执行所有 Subagent
  const results = await Promise.all(
    plan.map(({ role, task }) =>
      runSubagent(role, task, userRequest)
    )
  )

  // 第三步：汇总结果
  const summary = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: '你负责整合多个专家的输出，去除重复，解决矛盾，生成最终方案。',
    messages: [{
      role: 'user',
      content: `原始需求：${userRequest}\n\n各专家输出：\n${results.map((r, i) => `专家${i+1}：${r}`).join('\n\n')}`
    }]
  })

  return summary.content[0].text
}
```

---

## Handoff：信息传递要完整

多 Agent 最容易出问题的地方是 Agent 之间的信息交接。

**反面案例：**
```
Agent A：好的，我已经完成了数据库设计
Agent B：（收到"数据库设计完成"）好的，我来写 API...
         （但 Agent B 不知道具体的表结构是什么）
结果：API 和数据库对不上
```

**正确做法：** Handoff 时传递结构化的完整上下文

```javascript
// ❌ 只传结论
const handoff = "数据库设计已完成"

// ✅ 传递完整的工作产物
const handoff = {
  status: "completed",
  output: {
    tables: ["users", "orders", "products"],
    schema: ddlContent,       // 完整的 DDL
    notes: ["users 表有软删除逻辑", "orders 使用 UUID 主键"],
    constraints: ["外键约束列表"]
  },
  nextSteps: "Agent B 可以基于以上 schema 开始写 CRUD API"
}
```

---

## 用文件系统共享状态

多个 Agent 之间共享中间结果，最可靠的方式是通过文件，而不是内存或消息传递：

```javascript
import fs from 'fs/promises'
import path from 'path'

const WORKSPACE = '/tmp/multi-agent-task'

// Agent A：写入中间结果
async function agentA() {
  const schema = await designDatabase()
  
  await fs.mkdir(WORKSPACE, { recursive: true })
  await fs.writeFile(
    path.join(WORKSPACE, 'schema.json'),
    JSON.stringify(schema, null, 2)
  )
  await fs.writeFile(
    path.join(WORKSPACE, 'status.json'),
    JSON.stringify({ agentA: 'done', agentB: 'pending' })
  )
}

// Agent B：读取并继续
async function agentB() {
  const schema = JSON.parse(
    await fs.readFile(path.join(WORKSPACE, 'schema.json'), 'utf-8')
  )
  const api = await generateApi(schema)
  
  await fs.writeFile(path.join(WORKSPACE, 'api.ts'), api)
}
```

文件系统的好处：① 随时可以查看中间结果；② Agent 崩溃可以从上次的文件恢复；③ 不依赖内存，不怕上下文被截断。

---

## 错误处理

多 Agent 系统中，一个 Subagent 失败不应该让整个任务崩溃：

```javascript
async function runSubagentWithRetry(role, task, context, maxRetries = 2) {
  let lastError
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await runSubagent(role, task, context)
    } catch (error) {
      lastError = error
      if (attempt < maxRetries) {
        console.log(`Subagent(${role}) 第 ${attempt + 1} 次失败，重试...`)
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
      }
    }
  }
  
  // 重试用尽，返回降级结果，不要崩溃
  console.error(`Subagent(${role}) 所有重试失败：`, lastError)
  return `[${role} 任务失败，请人工处理这部分]`
}

// 并行时：即使部分 Subagent 失败也继续
const results = await Promise.allSettled(
  plan.map(({ role, task }) => runSubagentWithRetry(role, task, context))
)

const successResults = results
  .filter(r => r.status === 'fulfilled')
  .map(r => r.value)
```

---

## 成本与延迟

多 Agent 不是免费的，要算清楚账：

| 指标 | 单 Agent | 多 Agent（3个并行） |
|------|---------|-------------------|
| API 调用次数 | 1 | 至少 4（1个规划 + 3个执行 + 1个汇总） |
| 延迟（串行） | 基准 | 更长（因为有汇总步骤） |
| 延迟（并行） | 基准 | 接近单 Agent（因为并行） |
| 费用 | 基准 | 3x～5x |

多 Agent 在并行时能节省时间，但总费用更高。**只在任务复杂度真正需要时引入。**

---

## 安全注意事项

多 Agent 扩大了 Prompt Injection 的攻击面——被注入的 Subagent 可以污染它传给其他 Agent 的结果。

关键防护：
- 每个 Subagent 只给它完成任务必需的最小权限
- Subagent 的输出在传递给下一个 Agent 前，先做基本校验
- 详见 [2.21 Agent 安全：Prompt Injection 进阶威胁](../ch2-build-products/agent-security)

---

🛠️ **实战练习**

实现一个简单的"并行写作 Agent"：让 3 个 Subagent 分别写同一篇文章的"引言"、"正文"、"结论"，最后由 Orchestrator 汇总。

**步骤：**

1. 准备一个主题（例：《为什么工程师应该学 AI》）

2. 实现三个 Subagent，分别负责：
   - Agent 1：写 200 字的引言（为什么这个话题重要）
   - Agent 2：写 400 字的正文（3个核心理由）
   - Agent 3：写 100 字的结论（行动建议）

3. 用 `Promise.all` 并行执行，记录总耗时

4. 再改成串行执行，对比耗时差异

**期望结果**：并行版本耗时约等于最慢的单个 Subagent，远少于三者串行之和。

**进阶挑战**：加入第四个"审稿 Agent"，检查三个 Subagent 的输出是否连贯，如果不连贯就让对应的 Subagent 重写。

## 📌 关键结论

- 多 Agent 适合并行任务、上下文超限、需要专业分工或相互检验的场景
- 三种主要架构：Orchestrator-Subagent（最常见）、Pipeline（流水线）、Ensemble（投票）
- Handoff 时传递完整的结构化上下文，用文件系统共享状态比消息传递更可靠
- 错误处理要到位：用 `Promise.allSettled` + 重试机制，单个 Subagent 失败不能崩溃整个任务
- 多 Agent 费用是单 Agent 的 3x～5x，只在任务复杂度真正值得时引入，**从单 Agent 开始，按需扩展**

下一节：[4.7 AI 编程实战工作流](./ai-coding-workflow)
