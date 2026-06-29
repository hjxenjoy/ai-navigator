# 1.15 Embedding 模型选型指南

[2.2 向量与语义搜索](../ch2-build-products/embedding-search)讲过 Embedding 的原理和用法。但用哪个 Embedding 模型，是一个经常被忽视的选型决策——**选错了，RAG 质量再好的检索逻辑也救不回来。** 这一节专门讲怎么选。

---

## Embedding 模型的核心指标

选 Embedding 模型时，要关注这几个维度：

| 维度 | 说明 | 影响什么 |
|-----|------|---------|
| **语义质量** | 相似意思的句子向量是否够近 | 检索准确率，最重要 |
| **语言覆盖** | 中文、英文、多语言？ | 中文场景尤其重要 |
| **维度数** | 向量的"宽度"（如 768、1536、3072） | 存储、检索速度、质量 |
| **最大 Token 数** | 单次能编码多少文字 | 长文档处理能力 |
| **推理速度** | 编码一批文本要多久 | 构建索引的效率 |
| **费用** | 按 Token 计费 vs 免费本地运行 | 规模成本 |

---

## 主流 Embedding 模型一览

### 云端 API（付费）

| 模型 | 提供方 | 维度 | 最大 Token | 中文质量 | 价格（约） |
|-----|-------|-----|----------|---------|---------|
| `text-embedding-3-small` | OpenAI | 1536（可截断） | 8192 | 中 | ~$0.02/M tokens |
| `text-embedding-3-large` | OpenAI | 3072（可截断） | 8192 | 中 | ~$0.13/M tokens |
| `text-embedding-v3`（通用）| 阿里百炼 | 1024 | 8192 | 优 | ~¥0.07/M tokens |
| `embedding-3` | 智谱 AI | 2048 | 8192 | 优 | ~¥0.05/M tokens |

### 本地运行（免费）

| 模型 | 大小 | 维度 | 最大 Token | 中文质量 |
|-----|-----|-----|----------|---------|
| `bge-m3`（BAAI） | ~570MB | 1024 | 8192 | 优（多语言强） |
| `nomic-embed-text` | ~130MB | 768 | 8192 | 中 |
| `bge-large-zh-v1.5` | ~670MB | 1024 | 512 | 极优（纯中文） |
| `mxbai-embed-large` | ~670MB | 1024 | 512 | 中 |
| `bge-small-zh-v1.5` | ~90MB | 512 | 512 | 良（资源受限时） |

```bash
# 用 Ollama 运行本地 Embedding 模型（无需 API Key）
ollama pull bge-m3
ollama pull nomic-embed-text
```

---

## 中文场景怎么选

这是最重要的一个判断：

**你的内容主要是中文？** 优先用中文训练比重高的模型。

```
中文为主（文档、客服、知识库）：
  → 本地：bge-m3 或 bge-large-zh-v1.5
  → 云端：阿里百炼 text-embedding-v3（国产，中文语料足）

中英文混合（技术文档、代码注释）：
  → 本地：bge-m3（多语言最好，1 个模型搞定）
  → 云端：OpenAI text-embedding-3-small（英文强，中文可接受）

纯英文：
  → 本地：nomic-embed-text 或 mxbai-embed-large
  → 云端：OpenAI text-embedding-3-small 足够

不确定？→ 先用 bge-m3，稳健的全能选手
```

---

## 向量维度：不是越大越好

```
维度越高：
  ✅ 语义表达更丰富，质量略好
  ❌ 向量存储更大（3072 维是 768 维的 4 倍存储）
  ❌ 相似度计算更慢

维度越低：
  ✅ 存储小、检索快
  ❌ 语义损失，召回质量下降

实践建议：
  - 文档数量 < 100 万：768-1024 维完全够用
  - 文档数量 > 1000 万：考虑用低维版本，换取检索速度
  - 不要无脑选 3072 维（多付钱还变慢）
```

**Matryoshka（套娃）向量**：OpenAI text-embedding-3-x 支持截断到更小维度（如从 1536 截到 512），同时保持相当不错的质量。这让你可以"先用 512 维快速检索，再用 1536 维重排"，兼顾速度和质量。

```javascript
// OpenAI 截断维度示例
const res = await client.embeddings.create({
  model: 'text-embedding-3-small',
  input: text,
  dimensions: 512   // 截断到 512 维（而不是默认 1536）
})
```

---

## MTEB 基准：如何比较模型质量

[MTEB（Massive Text Embedding Benchmark）](https://huggingface.co/spaces/mteb/leaderboard) 是最权威的 Embedding 模型评测榜。

**怎么看榜单：**
- 看"Retrieval"列（而不是总分），因为你要用 Embedding 做检索
- 区分中文（Chinese）和英文榜单
- 关注模型大小（大模型分数高但你在乎推理速度时要权衡）

> ⚠️ MTEB 是通用基准，你的数据可能不一样。**别只看榜单，要在自己的数据上测**。一个在 MTEB 排第三的模型，在你的领域数据上可能比第一名更好。

---

## 实际测试方法

```javascript
// 快速评估脚本：对比两个 Embedding 模型在你数据上的检索效果
async function compareEmbeddings(queries, docs, models) {
  for (const modelId of models) {
    // 用该模型建索引
    const docEmbeddings = await Promise.all(
      docs.map(d => embed(d.content, modelId))
    )

    // 对每个查询，找 top-3 最相似的文档
    let hits = 0
    for (const { query, expectedDocId } of queries) {
      const qEmb = await embed(query, modelId)
      const scores = docEmbeddings.map((e, i) => ({ i, score: cosineSim(qEmb, e) }))
      scores.sort((a, b) => b.score - a.score)
      const top3 = scores.slice(0, 3).map(s => docs[s.i].id)
      if (top3.includes(expectedDocId)) hits++
    }

    console.log(`${modelId}: Recall@3 = ${(hits / queries.length * 100).toFixed(1)}%`)
  }
}

// 准备 20-30 个"查询 → 正确文档"的测试对
const testPairs = [
  { query: '怎么退款', expectedDocId: 'doc_refund_policy' },
  { query: '发货多久能到', expectedDocId: 'doc_shipping_time' },
  // ...
]

await compareEmbeddings(testPairs, myDocs, ['bge-m3', 'text-embedding-3-small'])
```

---

## 在 Ollama 里使用本地 Embedding 模型

```javascript
// Ollama 的 Embedding API（OpenAI 兼容格式）
async function embedWithOllama(text) {
  const res = await fetch('http://localhost:11434/api/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'bge-m3',
      prompt: text   // 注意 Ollama 用 "prompt" 而不是 "input"
    })
  })
  const data = await res.json()
  return data.embedding  // float[] 数组
}

// 或者用 OpenAI 兼容的格式（需要 Ollama 0.1.25+）
const ollamaClient = new OpenAI({
  baseURL: 'http://localhost:11434/v1',
  apiKey: 'ollama',
})
const res = await ollamaClient.embeddings.create({
  model: 'bge-m3',
  input: text
})
```

---

## 选型决策树

```
你的场景是什么？
│
├─ 中文为主
│  ├─ 数据敏感，不能出内网 → bge-m3（本地，Ollama）
│  ├─ 不在乎成本，要最好的 → 阿里百炼 text-embedding-v3
│  └─ 混合中英文 → bge-m3（最稳健的选择）
│
├─ 英文为主
│  ├─ 低成本/本地 → nomic-embed-text 或 mxbai-embed-large
│  └─ 云端 → text-embedding-3-small（够用且便宜）
│
└─ 不确定或需要多语言 → bge-m3（统一用一个模型）
```

> 💡 **实用策略**：先用 bge-m3（本地，免费），在自己的测试集上跑 Recall@3，如果满足要求就不换。只有明确不满足再考虑换云端大模型。不要为了"看起来更专业"去用更贵的模型。

---

## 🛠️ 实战练习：对比两个 Embedding 模型

1. 用 Ollama 拉取 `bge-m3` 和 `nomic-embed-text` 两个模型
2. 准备 10-15 对"查询 → 正确文档"测试数据（你业务里真实的）
3. 分别用两个模型建索引，跑上面的 `compareEmbeddings` 脚本
4. 对比 Recall@3 和编码速度（batchSize=10 时对比一批的耗时）

**期望结果**：你亲眼看到两个模型在你数据上的质量差异，而不是靠 MTEB 排名猜。

**进阶挑战**：测试 OpenAI `text-embedding-3-small` 的 512 维和 1536 维的质量差异，权衡是否值得用更大维度。

---

## 📌 关键结论

1. 中文场景优先选中文语料足的模型（bge-m3、阿里百炼），不要默认用 OpenAI
2. bge-m3 是稳健的全能选手：多语言强、本地运行免费、质量够用
3. 维度不是越高越好——768-1024 维在百万级文档内完全足够，高维度增加存储和检索成本
4. Matryoshka（套娃）向量支持截断，可以用小维度初筛再大维度重排
5. 一定要在自己的数据上测 Recall@3，不要只看 MTEB 榜单

---

下一节：[第 2 章 · 构建 AI 产品](/ch2-build-products/)
