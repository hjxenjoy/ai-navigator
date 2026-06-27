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

> 💡 **类比**：把每段话"翻译"成一串密码数字，意思相近的话翻译出来的数字在数值上也相近。"检索"就是找哪串数字和你的问题最接近。你不需要理解这些数字本身的含义，向量数据库会帮你完成这个比较。

---

## 什么是 Cosine Similarity（余弦相似度）

这是一把"相似度尺子"：测量两段话的向量有多接近，结果在 -1 到 1 之间，1 表示意思相同，0 表示无关，-1 表示意思相反。

名字里的"余弦"来自数学里的三角函数，但你完全不需要理解为什么叫这个名字。你只需要知道：**向量数据库就是用这把"尺子"来判断哪些内容和用户的问题最相关**，数字越接近 1，相关性越高。

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

## 🛠️ 动手搭一个最简 RAG（Node.js）

**前置准备：**

```bash
# 1. 新建目录
mkdir my-rag && cd my-rag
npm init -y
npm install openai          # DeepSeek / Ollama 都用 OpenAI 兼容的这个 SDK

# 2. 生成回答用 DeepSeek，设置 key
export DEEPSEEK_API_KEY="your-deepseek-key"

# 3. Embedding 用阿里百炼（DeepSeek 没有 Embedding API）
export DASHSCOPE_API_KEY="your-dashscope-key"

# 4. 新建文件
touch rag.mjs  # 注意是 .mjs，使用 ES Module
```

把下面的代码复制到 `rag.mjs`，然后运行 `node rag.mjs`：

```javascript
import OpenAI from "openai"

// 生成回答：DeepSeek 云端
const client = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY
})
const MODEL = "deepseek-v4-flash"

// 做 Embedding：阿里百炼（OpenAI 兼容接口）
const embedClient = new OpenAI({
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  apiKey: process.env.DASHSCOPE_API_KEY
})

// 模拟文档库（实际项目会从文件/数据库读取）
const documents = [
  { id: 1, text: "退款申请需要在购买后 7 天内提交，超出时限不予受理。" },
  { id: 2, text: "退款将在 3-5 个工作日内原路退回。" },
  { id: 3, text: "会员等级分为普通、银卡、金卡三个级别。" }
]

// 第一步：获取所有文档的 Embedding
async function embedTexts(texts) {
  // 注意：DeepSeek 没有 Embedding API，这里用阿里百炼的 text-embedding-v4。
  // 想离线免费可换本地 Ollama：baseURL "http://localhost:11434/v1" + model "nomic-embed-text"。
  const response = await embedClient.embeddings.create({
    model: "text-embedding-v4",
    input: texts
  })
  return response.data.map(d => d.embedding)
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
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }]
  })

  return response.choices[0].message.content
}

// 测试
const answer = await ragQuery("退款要多久？")
console.log(answer)
```

---

**进阶挑战**：把 `documents` 数组里的内容替换成你自己项目的真实文档（比如产品介绍、FAQ、API 文档），然后提几个用户可能问的真实问题，看检索结果和回答质量怎么样。

---

## 📌 关键结论

1. RAG = 先检索相关内容，再让 AI 基于内容回答，解决 AI 知识固定的问题
2. Embedding 把文字变成数字，意思相近的文字数字也相近
3. Chunking 决定检索的精度，需要根据内容调整
4. 实际项目中，建库（Embedding+存向量数据库）只做一次，查询时只做检索

---

下一节：[2.2 向量与语义搜索](./embedding-search)
