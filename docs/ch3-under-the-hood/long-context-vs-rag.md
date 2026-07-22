# 3.8 长上下文 vs RAG：选哪个？

> 🕐 内容截至 2026-07

随着模型上下文窗口快速扩展——Gemini 1M、DeepSeek 1M、GPT-5.4 1M——一个以前不存在的问题浮出水面：**你到底该把文档塞进上下文，还是用 RAG 检索？**

假设你的公司有一份 500 页的产品手册，用户会问各种相关问题。以前只有 RAG 一条路。现在你有了真实的选择：

- **方案 A（RAG）**：把手册分块、向量化，用户提问时检索最相关的几块
- **方案 B（长上下文）**：每次用户提问，把整本手册直接放进 context

这节就是帮你搞清楚什么时候选哪个。

---

## 两者的直觉类比

> 💡 **类比**：**RAG** 像图书馆的书目索引——你先查目录找到相关章节，再翻到那几页来读。速度快、成本低，但如果你对目录的理解有偏差，可能找到的不是最相关的章节。
>
> **长上下文** 像你把整本书带进考场，随时可以翻。但书太厚的时候，翻到某个章节需要时间，而且中间 300 页可能看花眼了，根本没注意到关键句子。

这个"中间 300 页看花眼"是真实存在的工程问题，叫做 **Lost in the Middle**（[3.6 节](./context-window-limits)已经提到过）：模型对上下文中间部分的关注度远低于开头和结尾，文档越长这个效应越明显。

---

## 何时优先选长上下文

以下场景里，**长上下文比 RAG 更合适**：

**1. 文档总量少（< 50K tokens，约 40 页以内）**

塞进去的 token 成本可接受，而且不用搭建向量数据库，开发最简单。

**2. 需要全局推理**

"整个文档有没有互相矛盾的地方？" "列出所有提到过退款政策的章节"——这类问题 RAG 根本做不好，因为它只能检索片段，没有全局视角。

**3. 文档之间有大量交叉引用**

合同里第 3 条款引用了附件 B，附件 B 又依赖正文第 12 条。片段检索会丢失这些关联，长上下文保留了完整的文档结构。

**4. 早期原型开发**

不想维护向量数据库，先跑通逻辑，后续再优化。

```javascript
// 方案 B：直接把文档内容塞进 context
import OpenAI from 'openai';
import fs from 'fs';

const client = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

async function answerWithFullContext(documentPath, userQuestion) {
  const documentContent = fs.readFileSync(documentPath, 'utf-8');

  const response = await client.chat.completions.create({
    model: 'deepseek-v4-flash',
    messages: [
      {
        role: 'system',
        content: '你是一个产品专家，根据提供的产品手册回答用户问题。如果手册中没有相关信息，请直接说明。',
      },
      {
        role: 'user',
        content: `以下是完整的产品手册：\n\n${documentContent}\n\n用户问题：${userQuestion}`,
      },
    ],
  });

  return response.choices[0].message.content;
}

// 使用示例
const answer = await answerWithFullContext('./product-manual.txt', '退款流程是什么？');
console.log(answer);
```

---

## 何时优先选 RAG

以下场景里，**RAG 比长上下文更合适**：

**1. 知识库很大（> 200 页）**

100 万 token 的文档塞进每个请求，成本直接爆炸（见下面的成本对比）。

**2. 数据需要实时更新**

文档每天都在变化？长上下文每次都要传全量。RAG 只需要更新变化的块，旧的向量继续用。

**3. 延迟敏感**

传输 100K token 的 context 本身就比传 2K token 慢很多，API 推理时间也更长。

**4. Lost in the Middle 问题严重**

文档超过 50 页后，关键信息很可能落在上下文的"中间地带"，模型容易忽略它。

> ⚠️ **常见误解**：上下文窗口越大，RAG 就越不需要了。这个结论不对。成本和延迟是真实的约束——就算模型支持 1M token，你也不会想让每次查询都付 1M token 的费用。

---

## 成本计算对比（数字说话）

**场景假设**：
- 知识库：100 页文档，约 100,000 tokens
- 查询量：每天 1,000 次用户提问
- 模型输入参考价格：$3 / 百万 tokens

| 方案 | 每次查询 tokens | 每日总 tokens | 参考日费用 |
|-----|---------------|-------------|---------|
| 长上下文 | 100,000 | 1 亿 | ~$300 |
| RAG（Top-5 块，每块 500 tokens） | 2,500 | 250 万 | ~$7.5 |

**在这个场景下，RAG 大约便宜 40 倍。**

用代码来估算任意参数下的成本差距：

```javascript
/**
 * 估算不同方案的每日 token 成本
 * @param {Object} params
 * @param {number} params.dailyQueries         - 每日查询次数
 * @param {number} params.fullDocTokens        - 完整文档 token 数
 * @param {number} params.retrievedChunks      - RAG 检索的块数
 * @param {number} params.tokensPerChunk       - 每块 token 数
 * @param {number} params.pricePerMillionTokens - 每百万 token 价格（美元）
 */
function estimateCost({
  dailyQueries,
  fullDocTokens,
  retrievedChunks,
  tokensPerChunk,
  pricePerMillionTokens,
}) {
  // 长上下文方案：每次查询都传完整文档
  const lcTokensPerQuery = fullDocTokens;
  const lcDailyTokens = lcTokensPerQuery * dailyQueries;
  const lcDailyCost = (lcDailyTokens / 1_000_000) * pricePerMillionTokens;

  // RAG 方案：每次只传检索到的几个块
  const ragTokensPerQuery = retrievedChunks * tokensPerChunk;
  const ragDailyTokens = ragTokensPerQuery * dailyQueries;
  const ragDailyCost = (ragDailyTokens / 1_000_000) * pricePerMillionTokens;

  const savingsRatio = lcDailyCost / ragDailyCost;

  return {
    longContext: {
      tokensPerQuery: lcTokensPerQuery,
      dailyTokens: lcDailyTokens,
      dailyCostUSD: lcDailyCost.toFixed(2),
    },
    rag: {
      tokensPerQuery: ragTokensPerQuery,
      dailyTokens: ragDailyTokens,
      dailyCostUSD: ragDailyCost.toFixed(2),
    },
    ragCheaperBy: `${savingsRatio.toFixed(1)}x`,
  };
}

// 实际估算
const result = estimateCost({
  dailyQueries: 1000,
  fullDocTokens: 100_000,       // 100 页文档
  retrievedChunks: 5,            // RAG 检索 Top-5
  tokensPerChunk: 500,           // 每块约 500 tokens
  pricePerMillionTokens: 3,      // $3 / 百万 tokens
});

console.log('长上下文方案:', result.longContext);
// → { tokensPerQuery: 100000, dailyTokens: 100000000, dailyCostUSD: '300.00' }

console.log('RAG 方案:', result.rag);
// → { tokensPerQuery: 2500, dailyTokens: 2500000, dailyCostUSD: '7.50' }

console.log(`RAG 便宜约 ${result.ragCheaperBy}`);
// → RAG 便宜约 40.0x
```

---

## 混合方案：两者都要

现实中最好的方案往往是**先 RAG 检索，再局部扩展上下文**：

1. 用向量检索找到最相关的 5 个块
2. 不只是传这 5 个块——把每个命中块的**前后各 2 段**也一起带上
3. 最终传给模型的是约 25 个段落，而不是 5 个孤立片段

这样做的好处：
- 成本可控（比全量长上下文便宜很多）
- 保留上下文完整性（不会因为切块切掉重要的前后关联）
- 命中率更高（关键句附近的内容也一并附上）

```javascript
/**
 * 检索 Top-K 个块，并扩展前后各 contextWindow 个块
 * @param {string[]} chunks          - 文档切块数组
 * @param {number[][]} chunkEmbeds   - 对应的向量数组
 * @param {number[]} queryEmbed      - 查询向量
 * @param {number} topK              - 检索数量
 * @param {number} contextWindow     - 每个命中块前后各扩展几块
 * @returns {string[]} 扩展后的块列表（按原文顺序）
 */
function retrieveWithContext(chunks, chunkEmbeds, queryEmbed, topK = 5, contextWindow = 2) {
  // 计算余弦相似度（越接近 1 越相似）
  function cosineSim(a, b) {
    const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dot / (normA * normB);
  }

  // 1. 找到 Top-K 个最相关块的索引
  const topIndices = chunkEmbeds
    .map((emb, i) => ({ index: i, score: cosineSim(queryEmbed, emb) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(r => r.index);

  // 2. 对每个命中块，扩展前后各 contextWindow 个块
  const expandedIndices = new Set();
  for (const idx of topIndices) {
    const start = Math.max(0, idx - contextWindow);
    const end = Math.min(chunks.length - 1, idx + contextWindow);
    for (let i = start; i <= end; i++) {
      expandedIndices.add(i);
    }
  }

  // 3. 按原始顺序返回，保留文档结构
  return [...expandedIndices]
    .sort((a, b) => a - b)
    .map(i => chunks[i]);
}
```

---

## 决策树

```
知识库总大小 < 50K tokens（约 40 页）？
  ├─ 是 → 优先长上下文（简单、全局视角、开发快）
  └─ 否 → 查询是否需要全局推理或跨文档分析？
           ├─ 是 → 混合方案（RAG 初筛 + 局部长上下文补全）
           └─ 否 → 数据是否频繁更新？
                    ├─ 是 → RAG（只更新变化的块，增量高效）
                    └─ 否 → 对延迟或成本敏感？
                             ├─ 是 → RAG
                             └─ 否 → 两者均可，以开发简单为准
```

---

## 🛠️ 实战练习

**目标**：拿同一份文档，分别用长上下文和 RAG 实现问答，亲自感受两者的差异。

**准备材料**：找一份 30-50 页的纯文本文件（产品文档、技术白皮书、公司规章均可）。需要：`DEEPSEEK_API_KEY` 环境变量；RAG 方案还需要本地运行 Ollama 并拉取 `nomic-embed-text` 模型（`ollama pull nomic-embed-text`）。

**步骤 1：长上下文方案**

```javascript
import OpenAI from 'openai';
import fs from 'fs';

const client = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

async function longContextQA(docPath, question) {
  const doc = fs.readFileSync(docPath, 'utf-8');
  const res = await client.chat.completions.create({
    model: 'deepseek-v4-flash',
    messages: [
      {
        role: 'system',
        content: '请根据提供的文档内容回答用户问题，如果文档中没有相关信息请直接说明。',
      },
      {
        role: 'user',
        content: `文档内容：\n${doc}\n\n问题：${question}`,
      },
    ],
  });
  return res.choices[0].message.content;
}

// 使用示例
const answer = await longContextQA('./my-doc.txt', '请问退款政策是什么？');
console.log(answer);
```

**步骤 2：RAG 方案（Ollama Embedding + DeepSeek 推理）**

```javascript
import OpenAI from 'openai';
import fs from 'fs';

// Embedding：本地 Ollama
const embedClient = new OpenAI({ baseURL: 'http://localhost:11434/v1', apiKey: 'ollama' });
// 推理：DeepSeek
const chatClient = new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey: process.env.DEEPSEEK_API_KEY });

function cosineSim(a, b) {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dot / (normA * normB);
}

function splitIntoChunks(text, chunkSize = 300, overlap = 50) {
  const words = text.split(/\s+/);
  const chunks = [];
  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    if (chunk.trim()) chunks.push(chunk);
  }
  return chunks;
}

async function ragQA(docPath, question) {
  const doc = fs.readFileSync(docPath, 'utf-8');
  const chunks = splitIntoChunks(doc);

  // 1. 把所有块向量化（生产中应提前做好并缓存）
  const chunkEmbeddings = await Promise.all(
    chunks.map(chunk =>
      embedClient.embeddings
        .create({ model: 'nomic-embed-text', input: chunk })
        .then(r => r.data[0].embedding)
    )
  );

  // 2. 把问题也向量化
  const queryEmbed = await embedClient.embeddings
    .create({ model: 'nomic-embed-text', input: question })
    .then(r => r.data[0].embedding);

  // 3. 找最相似的 Top-5 块
  const topChunks = chunkEmbeddings
    .map((emb, i) => ({ score: cosineSim(queryEmbed, emb), text: chunks[i] }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(s => s.text);

  const context = topChunks.join('\n\n---\n\n');

  // 4. 把检索到的块传给模型
  const res = await chatClient.chat.completions.create({
    model: 'deepseek-v4-flash',
    messages: [
      {
        role: 'system',
        content: '请根据提供的参考内容回答用户问题，如果参考内容中没有相关信息请直接说明。',
      },
      {
        role: 'user',
        content: `参考内容：\n${context}\n\n问题：${question}`,
      },
    ],
  });

  return res.choices[0].message.content;
}

const answer = await ragQA('./my-doc.txt', '请问退款政策是什么？');
console.log(answer);
```

**步骤 3：对比测试**

从文档中挑选 10 个问题（建议包含：文档开头的内容、文档中间的内容、需要跨章节推理的问题），分别用两种方案回答，记录：

- 回答是否正确（对照原文核实）
- 用上面的 `estimateCost()` 函数估算：如果是日均 100 次查询，一个月下来两种方案的成本差距有多大

**期望结果**：
- 文档开头、结尾的问题：两种方案差距不大
- 文档中间的问题：长上下文可能出现 Lost in the Middle，RAG 相对稳定
- 跨章节推理的问题：长上下文通常更准确
- 成本：RAG 通常便宜 10-40 倍

**进阶挑战**：用 `retrieveWithContext()` 函数实现混合方案（检索 Top-5 后扩展前后各 2 块），与纯 RAG 对比，看跨章节问题的回答质量有没有提升。

---

## 📌 关键结论

1. **没有绝对最优方案，文档量是第一决策因素**：知识库 < 40 页优先长上下文，> 200 页优先 RAG，中间地带看延迟和更新频率
2. **长上下文的真正风险是 Lost in the Middle**：不是"技术上放不进去"，而是"放进去了模型也看不见"
3. **RAG 的成本优势是数量级的**：相同查询量下，RAG 通常比长上下文便宜 10-40 倍
4. **混合方案是生产环境的最优解**：先检索缩小范围，再给每个命中块补全前后上下文，兼顾精准和完整性

---

下一节：[返回第4章：MCP 与 Agent 生态](../ch4-agent-mcp/)
