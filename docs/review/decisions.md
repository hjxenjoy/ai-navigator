# 决策速查

把散在各章的"该用哪个"判断题集中到一页，做选择时直接查。

---

## RAG vs Fine-tuning vs Prompt

```
任务需要动态/实时知识（文档、价格、用户数据）？
  ├─ 是 → RAG（或 Tool Use 查实时数据）
  └─ 否 ↓

需要固定的风格/格式/重复性任务，且有足够标注数据（几百~几千）？
  ├─ 是 → Fine-tuning
  └─ 否 ↓

Prompt Engineering 能解决吗？
  ├─ 能 → 用 Prompt（最便宜，先试这个）
  └─ 不能 → 回头看是不是数据/任务设计问题
```

> 铁律：别用 Fine-tune 注入知识（那是 RAG 的活）；永远先把 Prompt 做到位。→ [3.4](/ch3-under-the-hood/finetuning-vs-rag)

---

## 普通模型 vs 推理模型

| 任务 | 选 |
|-----|----|
| 简单问答、分类、改写、翻译 | 普通模型（小/快档） |
| 实时交互、聊天、补全 | 普通模型 |
| 大批量低难度处理 | 普通模型（推理模型又慢又贵） |
| 多步数学/逻辑、复杂代码、难题 | 推理模型 |
| 普通模型反复答错 | 推理模型 |

> 默认普通模型，搞不定再上推理模型。→ [1.7](/ch1-llm-engineering/reasoning-models)

---

## 本地（Ollama）vs 云端 API

| 你更看重 | 选 |
|---------|----|
| 数据隐私 / 离线 / 零调用成本 / 随便折腾 | 本地 |
| 最强能力 / 高并发 / 省心稳定 | 云端 |

> 常见组合：开发调试用本地，生产上线用云端（靠 OpenAI 兼容协议无缝切换）。→ [1.10](/ch1-llm-engineering/local-models)

---

## 选哪个模型档位（成本优先）

```
能用小/快档（DeepSeek-flash、本地）就别用大的
  → 简单问答、分类、改写

不够再上标准/强档（DeepSeek-pro、Qwen-plus）
  → 复杂代码、长文档

最后才考虑推理模型
  → 真正的难题（贵且慢）
```

→ [1.6](/ch1-llm-engineering/streaming-cost)

---

## 国产模型怎么选

| 需求 | 选 |
|-----|----|
| 默认主力（便宜、代码强） | DeepSeek |
| 要 Embedding / 多模态 | 阿里百炼（通义） |
| 要更强推理 | 智谱 GLM |
| 要更低价格 | 豆包 |
| 不想管多账号 | 聚合平台（硅基流动 / OpenRouter） |

→ [0.5](/ch0-mindset/china-llm)

---

## 单 Agent vs 多 Agent

```
任务能并行 / 上下文不够 / 需要专业分工 / 需要互相检验？
  ├─ 是 → 多 Agent（Orchestrator-Subagent）
  └─ 否 → 单 Agent

任务本身是顺序的，或很简单？
  → 单 Agent（多 Agent 只会增加复杂度）
```

> 从单 Agent 开始，按需引入。→ [4.6](/ch4-agent-mcp/multi-agent)

---

## 输出格式怎么控

| 需求 | 方式 |
|-----|------|
| 大致结构 | 在 Prompt 里说清楚 + 给例子 |
| 必须是合法 JSON | `response_format: { type: "json_object" }` |
| 连字段结构都锁死 | `json_schema` + `strict`（部分模型支持） |
| 本地小模型 | 多半只能 Prompt 约束 + 解析兜底 |

> 无论哪种都要 try-catch JSON.parse。→ [1.4](/ch1-llm-engineering/tool-use)

---

## 给 AI 加点什么：MCP / Tool / Skill / 代码

```
要解决的是"AI 缺能力"还是"AI 不知道怎么做"？

不知道怎么做（缺流程/规范/知识）  → Skill（或写进 System Prompt / CLAUDE.md）
缺能力（查数据/调接口/操作系统）
   ├─ 只在自己 App 里用，全程掌控    → 应用内 Tool（Function Calling）
   └─ 要给 Claude Code / 跨客户端复用 → MCP Server
流程是确定的，根本不需要 AI 决策   → 直接写代码（最可靠）
```

> 口诀：确定流程→代码；不会做→Skill；自己App要能力→Tool；跨客户端要能力→MCP。→ [5.8](/ch5-deep-dives/mcp-decision)

---

## RAG 进阶手法怎么选

先用基础 RAG，**针对实际的检索失败案例**再加，别一次全堆：

| 症状 | 加什么 |
|-----|-------|
| 问法口语、和文档措辞差很远 | 查询改写 / HyDE |
| 一个问题有多种问法、召回不全 | 多路召回融合 |
| 命中的块太碎、缺上下文 | 父文档检索 / 上下文检索（块前加背景） |
| 相关文档进了候选池但排名靠后 | Reranking 重排序 |
| 要精确匹配数字/编号 | Hybrid（语义 + 关键词 BM25） |
| 检索质量整体差 | 先查**分块**（5.4），别急着换模型 |
| 全局/关系型问题（"整体趋势""谁和谁什么关系"） | GraphRAG（建知识图谱 + 社区摘要，5.17） |
| 含糊/多步/多跳查询 | Agentic RAG（检索做成工具，自主改写+多轮，5.17） |
| 领域术语特殊、召回老差 | 先加通用 Reranker；确实不行才微调 Embedding（5.18） |

> 进阶范式（GraphRAG / Agentic RAG）成本更高，**先把朴素 RAG + 重排做到位**再上。

→ [5.1](/ch5-deep-dives/) · [5.4](/ch5-deep-dives/document-processing) · [5.17](/ch5-deep-dives/rag-advanced)

---

## 微调：要不要 + 走云端还是本地

```
能用 Prompt+Few-shot 达标？     → 别微调（最便宜）
缺知识 / 要实时？               → RAG，不是微调
要稳定的格式/风格/专项准确率，
 且 Prompt 搞不定 + 有几百+数据 → 微调
   ├─ 数据敏感 / 要自主 / 有显卡 → 本地 LoRA（5.15）
   └─ 图省事 / 没 GPU            → 云端 SFT（5.14）
想要小模型逼近大模型？          → 蒸馏
RAG 召回不准、想动检索模型？    → 先加通用 Reranker；
                                  领域术语特殊才微调 Embedding（5.18，换模型要重算全库向量）
```

> 先穷尽 Prompt/RAG，确实卡住才微调；先用小数据验证收益再扩。→ [5.16](/ch5-deep-dives/finetuning-cases) · [5.18](/ch5-deep-dives/finetuning-retrieval)

---

## 提示技巧怎么选

| 情况 | 用 |
|-----|----|
| 任务标准常见（翻译/总结） | Zero-shot，直接说，省 token |
| 要控格式/风格，或老出错 | Few-shot，给范例（含易错 case） |
| 普通模型做多步推理/难题 | CoT，"先推理再答" |
| 推理模型 | 直接给目标，**别**堆 CoT/思考指令 |
| 复杂任务 | 任务分解成明确小步 |
| 有唯一解但偶发错（数学/逻辑） | self-consistency，多跑取多数 |
| 要稳定/可复现 | 低温 + 固定 seed + 规则进 System |

→ [6.3](/ch6-prompt-mastery/reasoning) · [6.4](/ch6-prompt-mastery/output-control)

---

## 提示改不动了，换什么

```
一个提示越补越乱、还是不稳定 → 别再硬调，换思路：
  任务太杂           → 拆成多步 / 多个提示
  要稳定格式/风格+数据够 → 微调（5.16）
  缺知识 / 要实时     → RAG（5.1-5.5）
  确定性的活         → 用代码兜底（4.8 补偿性代码）
```

> 提示工程不是万能锤；怎么调都不稳，常是在用提示硬解该用别的手段的问题。→ [6.6](/ch6-prompt-mastery/iteration)

---

下一页：[常见坑与 FAQ](./pitfalls)
