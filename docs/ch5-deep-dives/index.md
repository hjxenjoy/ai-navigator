# 5.1 RAG·进阶检索

> **关于第 5 章**：前面 0–4 章帮你建立完整认知。第 5 章是**深入与落地**——把 RAG、MCP、Skill、模型微调四个主题讲透，每节都给**完整可跑的代码 + 架构图 + 落地步骤**。
>
> 本章是**四条相互独立的支线**（RAG 5.1–5.5 / MCP 5.6–5.9 / Skill 5.10–5.12 / 微调 5.13–5.16），不必从头读到尾——**用到哪块挑哪块**，侧边栏已按四个专题折叠分组。另有两节进阶（追加编号）：[5.17 GraphRAG 与 Agentic RAG](./rag-advanced) 归 RAG 支线、[5.18 Embedding 与 Reranker 微调](./finetuning-retrieval) 归微调支线。

[2.1](/ch2-build-products/) 的最简 RAG 能跑通，但真上线你会发现：**检索经常找不对**。用户问"退钱要等几天"，文档里写的是"退款到账时效"——意思一样，措辞差很远，向量也就不够近。这一节讲让检索变准的几个进阶手法。

## 为什么基础检索会"找不准"

```
用户问题  ──直接 embedding──▶  和文档块比相似度
   ↑                                  ↑
问得短、口语、视角不同          写得正式、完整、视角不同
        └──── 两边"长得不像"，相似度低，漏检 ────┘
```

核心矛盾：**问题的形态 ≠ 答案的形态**。下面几招都是在缩小这个差距。

---

## 手法一：查询改写（Query Rewriting）

先让 LLM 把用户的口语问题，改写成更接近文档措辞、信息更完整的检索词。

```javascript
import OpenAI from "openai"
const chat = new OpenAI({ baseURL: "https://api.deepseek.com", apiKey: process.env.DEEPSEEK_API_KEY })
const MODEL = "deepseek-v4-flash"

async function rewriteQuery(question) {
  const res = await chat.chat.completions.create({
    model: MODEL,
    messages: [{
      role: "user",
      content: `把下面的用户问题改写成更适合检索知识库的查询，补全省略的主体、用更正式的措辞，只输出改写后的查询：\n\n${question}`
    }]
  })
  return res.choices[0].message.content.trim()
}
// "退钱要等几天" → "退款金额到账需要多长时间 退款时效"
```

> 💡 多轮对话里尤其有用：用户问"那它呢？"，先用 LLM 结合上文把指代补全成完整问题，再去检索。

---

## 手法二：HyDE（假设性文档嵌入）

反过来想：与其拿"问题"去匹配"答案"，不如**先让 LLM 编一个假设答案，拿这个假答案去检索**——因为假答案和真文档"长得更像"。

> 💡 **比喻**：找一本书，描述"我想要的书大概长这样"比只说"关于退款的"更容易在书架上找到相似的。

```javascript
async function hyde(question) {
  const res = await chat.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: `针对这个问题，写一段"假设的标准答案"（2-3句，内容可以是编的，只为检索用）：\n${question}` }]
  })
  return res.choices[0].message.content.trim()   // 拿这段去做 embedding 检索
}
```

注意：HyDE 多花一次模型调用，适合检索质量要求高、且基础检索明显不准的场景。

---

## 手法三：多路召回 + 融合（Multi-Query Fusion）

一个问题可以有多种问法。让 LLM 生成几个查询变体，**分别检索再合并去重**，覆盖更全。

```javascript
async function multiQuery(question, n = 3) {
  const res = await chat.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: `把下面问题改写成 ${n} 个不同角度的检索查询，每行一个，只输出查询：\n${question}` }]
  })
  return res.choices[0].message.content.split("\n").map(s => s.trim()).filter(Boolean)
}
// 对每个变体各检索 topK，把结果按出现次数/最高分合并，取前几名
```

---

## 手法四：父文档检索（Small-to-Big）

**用小块检索（精准），但返回大块给 LLM（上下文完整）**。小块命中率高，大块信息全，两全。

```
切分时：大块（如整节）↘
                      └→ 再切成小块，小块记住"我属于哪个大块"
检索时：拿小块比相似度（准）→ 命中后，返回它所属的大块给 LLM（全）
```

实现：存储时给每个小块带 `parentId`，检索到小块后用 `parentId` 取回父块再拼进 Prompt。

---

## 手法五：组合拳与排序

这些手法可以叠加，Anthropic 实测的有效组合（详见 [5.4 上下文检索](./document-processing)）：

```
基础向量检索
  + 上下文检索（嵌入前给每块加说明）     ─┐
  + 关键词检索 BM25（Hybrid，见 2.2）     ├─ 召回率大幅提升
  + Reranking 重排序（见 2.2）           ─┘
```

> ⚠️ 别一上来全堆上。先用基础 RAG 跑，**针对实际的检索失败案例**再决定加哪招——加错了既贵又不一定有用。

---

## 🛠️ 实战练习：给 2.1 的 RAG 加查询改写

在 [2.1 的 RAG](/ch2-build-products/) 基础上，检索前先调用 `rewriteQuery()`，用改写后的查询去做 embedding：

1. 准备几个"口语化、和文档措辞差很远"的问题（如"退钱啥时候到"）
2. 对比"直接检索"和"改写后检索"命中的文档块
3. 看改写是否让相关文档排到了前面

**进阶挑战**：把 HyDE 也加上，三种方式（直接 / 改写 / HyDE）跑同一批问题，统计哪种召回率最高、各自多花了多少 token。

---

## 📌 关键结论

1. 基础检索不准的根因：问题的形态 ≠ 答案的形态
2. 查询改写：把口语问题改成接近文档的措辞；多轮里还能补全指代
3. HyDE：先让 LLM 编个假答案去检索，因为假答案和真文档更像
4. 多路召回融合：多个查询变体分别检索再合并，覆盖更全
5. 父文档检索：小块检索保精准，返回大块保上下文
6. 这些可叠加（+Hybrid+Rerank），但按实际失败案例增量加，别一次全上

---

下一节：[5.2 RAG·接入真实向量库](./vector-db)
