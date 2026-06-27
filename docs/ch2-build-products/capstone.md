# 2.9 实战项目：从零搭一个知识库问答 Agent

前面每一节都是单点。这一节把它们**串成一个完整的小产品**：一个能查知识库、自己决定要不要检索、还能自我评估的客服 Agent。

> 这是本章的综合练习。它用到：RAG（2.1）、分块（2.2）、Agent/工具循环（2.3）、评估（2.5）、生产与成本（2.6/2.8）。建议先把这几节过一遍。

## 我们要做什么

一个客服问答 Agent，具备：
1. **知识库检索**：把 RAG 包装成一个**工具**，让 Agent 自己决定何时查
2. **Agent 循环**：能"先查资料再回答"，查不到就如实说
3. **自我评估**：跑一组测试用例，输出通过率

技术栈延续全书约定：对话用 DeepSeek，Embedding 用阿里百炼，OpenAI 兼容写法。

---

## 第一步：环境与配置

```bash
mkdir kb-agent && cd kb-agent && npm init -y
npm install openai
export DEEPSEEK_API_KEY="..."     # 生成回答
export DASHSCOPE_API_KEY="..."    # 阿里百炼，做 Embedding
```

```javascript
// config.mjs
import OpenAI from "openai"

export const chat = new OpenAI({ baseURL: "https://api.deepseek.com", apiKey: process.env.DEEPSEEK_API_KEY })
export const MODEL = "deepseek-v4-flash"

export const embed = new OpenAI({
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  apiKey: process.env.DASHSCOPE_API_KEY
})
export const EMBED_MODEL = "text-embedding-v4"
```

---

## 第二步：把 RAG 做成一个"检索工具"

和 [2.1 节](./)的区别：那里是"先检索再硬拼进 Prompt"，这里把检索做成**工具**，让 Agent 自己判断要不要用——简单寒暄就不必检索，省钱又自然。

```javascript
// kb.mjs —— 知识库与检索
import { embed, EMBED_MODEL } from "./config.mjs"

const documents = [
  { id: 1, text: "退款申请需在购买后 7 天内提交，超时不予受理。" },
  { id: 2, text: "退款将在 3-5 个工作日内原路退回。" },
  { id: 3, text: "会员分普通、银卡、金卡三级，按累计消费自动升级。" },
  { id: 4, text: "客服在线时间为每天 9:00-21:00。" }
]

let docEmbeddings = null  // 启动时算一次，缓存在内存

async function embedTexts(texts) {
  const res = await embed.embeddings.create({ model: EMBED_MODEL, input: texts })
  return res.data.map(d => d.embedding)
}
function cosine(a, b) {
  const dot = a.reduce((s, v, i) => s + v * b[i], 0)
  const na = Math.sqrt(a.reduce((s, v) => s + v * v, 0))
  const nb = Math.sqrt(b.reduce((s, v) => s + v * v, 0))
  return dot / (na * nb)
}

export async function initKB() {
  docEmbeddings = await embedTexts(documents.map(d => d.text))
}

export async function searchKB(query, topK = 2) {
  const [q] = await embedTexts([query])
  return documents
    .map((d, i) => ({ text: d.text, score: cosine(q, docEmbeddings[i]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}
```

---

## 第三步：Agent 循环（检索作为工具）

```javascript
// agent.mjs
import { chat, MODEL } from "./config.mjs"
import { searchKB } from "./kb.mjs"

const tools = [{
  type: "function",
  function: {
    name: "search_kb",
    description: "在客服知识库中检索与用户问题相关的资料。回答涉及政策/规则/事实时应先调用它。",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "检索关键词或问题" } },
      required: ["query"]
    }
  }
}]

const SYSTEM = `你是一个客服助手。回答涉及政策、规则、事实时，必须先用 search_kb 检索，
基于检索结果回答；检索不到就如实说"暂时没有相关信息"，不要编造。
遇到不确定的情况，停下来说明，不要假设。回答简洁，控制在 3 句内。`

export async function ask(question) {
  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: question }
  ]

  while (true) {
    const res = await chat.completions.create({ model: MODEL, messages, tools })
    const msg = res.choices[0].message

    if (!msg.tool_calls) return msg.content   // 没有要查资料，直接回答

    messages.push(msg)
    for (const call of msg.tool_calls) {
      let result = "未知工具"
      if (call.function.name === "search_kb") {
        const { query } = JSON.parse(call.function.arguments)
        result = await searchKB(query)        // 真正执行检索
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) })
    }
  }
}
```

```javascript
// run.mjs
import { initKB } from "./kb.mjs"
import { ask } from "./agent.mjs"

await initKB()
console.log(await ask("退款要多久？"))        // 应触发检索
console.log(await ask("你好呀"))              // 寒暄，应不检索
console.log(await ask("你们卖手机吗？"))       // 知识库没有，应如实说没有
```

> 观察：第一个问题 Agent 会**先调用 `search_kb` 再回答**；寒暄那句它不会浪费一次检索；知识库外的问题它应该如实说没有，而不是编。

---

## 第四步：给它做评估

光看着对不够，要能量化。沿用 [2.5 节](./evaluation)的思路建测试集：

```javascript
// eval.mjs
import { initKB } from "./kb.mjs"
import { ask } from "./agent.mjs"

const testCases = [
  { q: "退款多久到账？", expect: ["3-5", "工作日"], reject: [] },
  { q: "退款有时间限制吗？", expect: ["7"], reject: [] },
  { q: "客服几点上班？", expect: ["9", "21"], reject: [] },
  { q: "你们卖手机吗？", expect: [], reject: ["是", "出售"] }  // 知识库没有，不该乱答
]

await initKB()
let pass = 0
for (const tc of testCases) {
  const ans = await ask(tc.q)
  const ok = tc.expect.every(k => ans.includes(k)) && !tc.reject.some(k => ans.includes(k))
  console.log(`${ok ? "✅" : "❌"} ${tc.q} → ${ans}`)
  if (ok) pass++
}
console.log(`\n通过率：${(pass / testCases.length * 100).toFixed(0)}%`)
```

每次你改 System Prompt、改分块、换模型，跑一遍这个，看数字升了还是降了——这就是工程化的 AI 开发。

---

## 第五步：上线前再过三关

这是 demo。变成产品前对照 [生产清单](/review/pitfalls)：

- **健壮性**：`searchKB` / 模型调用加 try-catch + 重试；工具失败要让 Agent 感知（[2.6](./production)）
- **成本**：估一下月成本（[2.8](./cost-estimation)），System Prompt 已尽量短，检索只取 top 2
- **安全**：用户问题是外部输入，注意注入；知识库做用户级隔离；密钥走环境变量（[2.7](./security)）
- **持久化**：`documents` 换成真实数据源，向量存进向量库（别每次重算）

---

## 🛠️ 进阶挑战

1. **接真实数据**：把 `documents` 换成你项目的真实文档，按 [2.2 分块](./embedding-search)切分后入库。
2. **多轮对话**：把单次 `ask` 改成保留历史的对话（[1.5](/ch1-llm-engineering/conversation)），让它能理解"那它呢？"这类追问。
3. **全本地版**：对话换本地 `qwen2.5:14b`、Embedding 换 `nomic-embed-text`，做一个**完全离线零成本**的版本（[1.10](/ch1-llm-engineering/local-models)）。
4. **加 LLM 评估**：用 [2.5 的 LLM-as-Judge](./evaluation) 给回答质量打分，而不只是关键词匹配。

---

## 📌 关键结论

1. 把 RAG 包成**工具**交给 Agent 自己决定何时检索，比无脑硬拼更省、更自然
2. 一个完整 AI 功能 = 检索 + Agent 循环 + 评估 + 生产加固，缺一不可
3. System Prompt 里的"查不到就如实说、不确定就停下"是质量和安全的关键约束
4. 有了评估集，每次改动都能用数字判断好坏——这是 AI 工程区别于"碰运气调 Prompt"的核心

---

第 2 章完成。下一步：[第 3 章 · 理解引擎盖下面](/ch3-under-the-hood/)
