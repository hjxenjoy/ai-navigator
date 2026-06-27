# 2.1 RAG 完整 Pipeline

RAG（Retrieval-Augmented Generation，检索增强生成）解决的是 AI 的一个根本问题：**它的知识是固定的，但你的业务数据是动态的。**

## 为什么需要 RAG

假设你想让 AI 回答关于你公司内部文档的问题。有几个选项：

| 方案 | 做法 | 问题 |
|-----|-----|-----|
| 直接问 AI | 啥都不做 | AI 不知道你的内部文档 |
| 塞进上下文 | 把文档全贴进去 | 文档太多会超出上下文限制 |
| Fine-tuning | 重新训练模型 | 昂贵、慢、数据更新就得重训 |
| **RAG** | **检索相关内容 + 提问** | ✅ 灵活、实时、可扩展 |

---

## RAG 的完整流程

RAG 分两个阶段：**建库（索引）** 和 **查询（检索+生成）**。

### 阶段一：建库

```
原始文档（PDF/Word/网页/代码...）
         ↓
    文本提取
         ↓
    分片（Chunking）
    把长文档切成小块
         ↓
    向量化（Embedding）
    每个小块 → 一组数字（向量）
         ↓
    存入向量数据库
```

### 阶段二：查询

```
用户提问
    ↓
把问题也向量化
    ↓
在向量数据库里找最相似的内容块
（语义搜索）
    ↓
把找到的内容 + 用户问题组合成 Prompt
    ↓
AI 根据这些内容生成回答
```

---

## 什么是 Embedding（向量化）

这是理解 RAG 的关键概念。

**Embedding 是把文字转换成一组数字的过程。** 这组数字（向量）能够捕捉文字的"语义"——意思相近的文字，转换出来的数字也相近。

```
"如何退款" → [0.2, 0.8, -0.3, 0.5, ...]  (几百到几千个数字)
"退款流程" → [0.19, 0.82, -0.28, 0.51, ...] (很相似！)
"今天天气" → [0.9, -0.2, 0.7, -0.1, ...]  (差异很大)
```

> 💡 **类比**：就像把每段文字放在一个多维空间里，意思相近的文字离得近，意思不同的文字离得远。"检索"就是找距离最近的点。

---

## 什么是 Cosine Similarity（余弦相似度）

这是判断两个向量"有多像"的计算方法。结果在 -1 到 1 之间，1 表示完全相同，0 表示无关，-1 表示完全相反。

你不需要记公式，只需要知道：**向量数据库用这个来判断"哪些内容和用户的问题最相关"**。

---

## 什么是 Chunking（分片）

把长文档切成合适大小的片段，这个过程叫 Chunking。

**为什么要分片？**
- 整个文档塞进上下文太大
- 精确检索需要小的单元，检索"一整本书"不如检索"一段话"

**常见分片策略：**

```
固定大小：每 500 个 Token 切一片，相邻片重叠 50 Token
          简单，但可能把一段完整的内容切断

按结构：按标题、段落、章节切
         保持语义完整，但大小不均

滑动窗口：每片 500 Token，每次移动 250 Token
          片之间有重叠，避免关键信息被切断
```

> ⚠️ Chunk 大小是需要根据你的内容和任务调整的，没有一个"最佳值"。

---

## 动手搭一个最简 RAG（Node.js）

```javascript
import Anthropic from "@anthropic-ai/sdk"

const client = new Anthropic()

// 模拟文档库（实际项目会从文件/数据库读取）
const documents = [
  { id: 1, text: "退款申请需要在购买后 7 天内提交，超出时限不予受理。" },
  { id: 2, text: "退款将在 3-5 个工作日内原路退回。" },
  { id: 3, text: "会员等级分为普通、银卡、金卡三个级别。" }
]

// 第一步：获取所有文档的 Embedding
async function embedTexts(texts) {
  // 注意：Anthropic 目前没有专门的 Embedding API，
  // 通常用 OpenAI text-embedding-3-small 或 Cohere Embed
  // 这里用 OpenAI 做示例
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: texts })
  })
  const data = await response.json()
  return data.data.map(d => d.embedding)
}

// 计算余弦相似度
function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0)
  const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0))
  const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0))
  return dot / (normA * normB)
}

// 完整的 RAG 查询
async function ragQuery(question) {
  // 1. 对所有文档做 Embedding（实际项目只做一次，存数据库）
  const docTexts = documents.map(d => d.text)
  const docEmbeddings = await embedTexts(docTexts)

  // 2. 对问题做 Embedding
  const [questionEmbedding] = await embedTexts([question])

  // 3. 找最相关的文档
  const similarities = docEmbeddings.map((emb, i) => ({
    doc: documents[i],
    score: cosineSimilarity(questionEmbedding, emb)
  }))
  similarities.sort((a, b) => b.score - a.score)
  const topDocs = similarities.slice(0, 2) // 取最相关的 2 个

  // 4. 组合 Prompt
  const context = topDocs.map(d => d.doc.text).join("\n")
  const prompt = `根据以下信息回答用户的问题：

${context}

用户问题：${question}

如果以上信息不足以回答，请如实说明。`

  // 5. 让 AI 生成回答
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }]
  })

  return response.content[0].text
}

// 测试
const answer = await ragQuery("退款要多久？")
console.log(answer)
```

---

## 📌 关键结论

1. RAG = 先检索相关内容，再让 AI 基于内容回答，解决 AI 知识固定的问题
2. Embedding 把文字变成数字，意思相近的文字数字也相近
3. Chunking 决定检索的精度，需要根据内容调整
4. 实际项目中，建库（Embedding+存向量数据库）只做一次，查询时只做检索

---

下一节：[2.2 向量与语义搜索](./embedding-search)
