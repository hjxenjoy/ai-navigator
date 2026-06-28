# 5.2 RAG·接入真实向量库

[2.1](/ch2-build-products/) 的 RAG 把向量存在内存数组里——demo 没问题，但真上线不行：进程一重启全没了、几万条文档每次都要重算 embedding、没法按条件过滤。这一节给两套能直接落地的方案。

## 为什么要换成真向量库

```
内存数组（demo）              真向量库（生产）
─────────────              ─────────────
重启就丢                  →  持久化存储
每次全量重算 embedding     →  存一次，增量更新
全表线性扫描，慢            →  索引加速（HNSW），百万级毫秒返回
不能按条件筛               →  元数据过滤（按用户/分类/时间）
```

选型回顾（详见 [2.2](/ch2-build-products/embedding-search)）：**已经在用 PostgreSQL → 上 pgvector**；要专业向量库 → Qdrant。下面两套都给完整可跑代码。

> 全程 Embedding 用阿里百炼 `text-embedding-v4`（[0.5](/ch0-mindset/china-llm)）。⚠️ **建库时的维度必须和 Embedding 模型一致**，`text-embedding-v4` 默认 1024 维，下面都用 1024。

```javascript
// embed.mjs —— 公共 Embedding 函数
import OpenAI from "openai"
const ec = new OpenAI({ baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", apiKey: process.env.DASHSCOPE_API_KEY })
export async function embed(texts) {
  const res = await ec.embeddings.create({ model: "text-embedding-v4", input: texts })
  return res.data.map(d => d.embedding)
}
```

---

## 方案 A：pgvector（已有 PostgreSQL 首选）

**第一步：装扩展、建表、建索引**

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE docs (
  id        BIGSERIAL PRIMARY KEY,
  content   TEXT NOT NULL,
  source    TEXT,                 -- 元数据：来源
  category  TEXT,                 -- 元数据：分类，用于过滤
  embedding vector(1024)          -- 维度对齐 text-embedding-v4
);

-- HNSW 索引：让相似度搜索从"全表扫描"变成"毫秒返回"。vector_cosine_ops = 用余弦距离
CREATE INDEX ON docs USING hnsw (embedding vector_cosine_ops);
```

**第二步：写入（含增量更新）**

```javascript
import pg from "pg"
import pgvector from "pgvector/pg"
import { embed } from "./embed.mjs"

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
await pgvector.registerTypes(pool)   // 让 pg 认识 vector 类型

async function upsertDocs(rows) {   // rows: [{content, source, category}]
  const vectors = await embed(rows.map(r => r.content))
  for (let i = 0; i < rows.length; i++) {
    await pool.query(
      `INSERT INTO docs (content, source, category, embedding) VALUES ($1,$2,$3,$4)`,
      [rows[i].content, rows[i].source, rows[i].category, pgvector.toSql(vectors[i])]
    )
  }
}
// 增量更新就是：新文档来了只对新文档算 embedding 再 INSERT，老的不动
```

**第三步：检索（带元数据过滤）**

```javascript
async function search(query, { category, topK = 3 } = {}) {
  const [qv] = await embed([query])
  // <=> 是余弦距离；1 - 距离 = 相似度。WHERE 做元数据过滤
  const { rows } = await pool.query(
    `SELECT content, source, 1 - (embedding <=> $1) AS score
       FROM docs
      WHERE ($2::text IS NULL OR category = $2)
      ORDER BY embedding <=> $1
      LIMIT $3`,
    [pgvector.toSql(qv), category ?? null, topK]
  )
  return rows
}
// search("退款多久到账", { category: "售后" })
```

> 💡 pgvector 的好处：向量和你的业务数据**同一个库、同一个事务**，能直接 JOIN 用户表做权限过滤（呼应 [2.7 RAG 越权](/ch2-build-products/security)）。中小规模这就够了。

---

## 方案 B：Qdrant（专用向量库）

数据量大、要专业向量检索能力时用。先用 Docker 起一个：`docker run -p 6333:6333 qdrant/qdrant`。

```javascript
import { QdrantClient } from "@qdrant/js-client-rest"
import { embed } from "./embed.mjs"

const client = new QdrantClient({ host: "localhost", port: 6333 })
const COLLECTION = "docs"

// 第一步：建集合（size 维度对齐，distance 用余弦）
await client.createCollection(COLLECTION, {
  vectors: { size: 1024, distance: "Cosine" }
})

// 第二步：写入（payload 就是元数据，随向量一起存）
async function upsertDocs(rows) {
  const vectors = await embed(rows.map(r => r.content))
  await client.upsert(COLLECTION, {
    points: rows.map((r, i) => ({
      id: r.id,
      vector: vectors[i],
      payload: { content: r.content, source: r.source, category: r.category }
    }))
  })
}

// 第三步：检索（带元数据过滤）
async function search(query, { category, topK = 3 } = {}) {
  const [qv] = await embed([query])
  const res = await client.query(COLLECTION, {
    query: qv,
    limit: topK,
    filter: category ? { must: [{ key: "category", match: { value: category } }] } : undefined,
    with_payload: true
  })
  return res.points.map(p => ({ ...p.payload, score: p.score }))
}
```

---

## 整体架构

```
【离线建库，一次性 + 增量】
原始文档 → 分块(5.4) → Embedding(百炼) → 写入向量库(pgvector/Qdrant)

【在线问答，每次请求】
用户问题 → 进阶检索(5.1) → 向量库 topK + 元数据过滤
        → 拼进 Prompt → DeepSeek 生成 → 带引用的回答(5.3)
```

> ⚠️ **建库和问答是两条独立的线**。Embedding 在写入时算一次存起来，问答时只算"问题"那一次——别每次问答都把全库重算（这是 demo 里最容易留下的坑）。

---

## 🛠️ 实战练习：把 2.11 的 Capstone 换成真向量库

把 [2.11 知识库 Agent](/ch2-build-products/capstone) 里的内存数组检索，换成上面任一方案：

1. 选 pgvector（有 PG 就用）或 Qdrant（Docker 起一个）
2. 把那 4 条 `documents` 写进向量库（带上 `category` 元数据）
3. 让 `searchKB` 工具改成查向量库，并支持按 `category` 过滤
4. 重启进程后再问一次——验证数据没丢、不用重算

**进阶挑战**：加一个"增量添加文档"的脚本，新增几条文档后无需重建整库即可被检索到。

---

## 📌 关键结论

1. 内存数组只够 demo；上线要持久化、增量更新、索引加速、元数据过滤
2. 已有 PostgreSQL → pgvector（同库同事务，能 JOIN 业务表做权限）；要专业向量库 → Qdrant
3. 建库维度必须和 Embedding 模型一致（text-embedding-v4 = 1024）
4. HNSW 索引让相似度搜索从全表扫描变成毫秒返回
5. 建库（存一次）与问答（只算问题）是两条独立的线，别每次重算全库

---

下一节：[5.3 RAG·评估与防幻觉](./rag-eval)
