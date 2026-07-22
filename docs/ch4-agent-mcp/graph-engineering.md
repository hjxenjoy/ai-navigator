# 4.16 Graph 编排深入：State Schema 与工程化

[4.12](./workflow-orchestration)讲了工作流的基本结构：节点 + 边 + 状态。但"会写"和"设计好"之间，隔着一整套工程判断。这一节讲的就是 Graph Engineer 真正的深水区——**State Schema 设计**，以及围绕它的节点切分与边设计。

> 💡 为什么状态是核心？因为节点和边是"看得见"的结构，画张图就清楚了；而状态是"看不见"的契约——节点之间到底交接了什么、以什么形状交接。系统变成黑盒，十有八九不是节点写错了，而是这张契约糊了。

## 一个贯穿全节的类比：车间里的交接单

把多节点工作流想象成一个车间，每个节点是一个工位：

- **State 就是工位之间传递的交接单**。单子上的字段，就是全车间公认的"共享信息"。
- **交接单该印哪些栏目**（Schema 设计），决定了这个车间是有条不紊还是鸡飞狗跳。
- 栏目太多 → 每个工位都在单子上乱写，没人说得清哪个字段以谁为准；栏目太含糊 → 下一道工序拿到的信息没法用。

车间管理的功夫，全在这张交接单的设计上。State Schema 同理。

---

## 原则一：最小化——State 只放"必须跨节点共享"的

新手最常犯的错，是把 State 当成万能储物柜，什么都往里塞：

```javascript
// ❌ 上帝 State：什么都往里放
const state = {
  query: '...',
  searchResults: [...],
  webResults: [...],
  dbResults: [...],        // searchResults 已经包含了，冗余
  llmRawResponse: '...',   // 原始响应 8000 token，只为提取一个字段
  intermediateDraft1: '...',
  intermediateDraft2: '...',
  systemPromptUsed: '...', // 配置不该进 State
  nodeExecutionLogs: [...] // 日志不该进 State
}
```

三个判断标准，**三个都满足才配进 State**：

1. **后面不止一个节点要用它**——只有一个节点用的，放节点局部变量里
2. **它的生命周期跨过节点边界**——节点内算出来、节点内用完的，不进 State
3. **它会被持久化/给人看**——需要进检查点、需要审计的，才值得放

> 💡 **为什么最小化这么重要**：State 会跟着整个工作流走——每个节点都能读、都可能写、每次持久化都要序列化它。State 里每多一个字段，就多一分"谁在什么时候改了它"的心智负担。State 越小，系统越透明。

对应的检查点设计含义：State 是要被序列化存盘的（[4.12 状态持久化](./workflow-orchestration)），塞进 8000 token 的原始响应，检查点又大又慢。

---

## 原则二：类型约束——每个字段有明确的形状

State 是全图共享的契约，契约不写清楚，就等于没有契约。哪怕在 JS 里，也应该给 State 定义**明确的形状并做校验**：

```javascript
// ✅ 用 zod 定义 State Schema（pnpm add zod）
import { z } from 'zod'

const ResearchState = z.object({
  query: z.string(),
  sources: z.array(z.object({
    url: z.string().url(),
    title: z.string(),
    snippet: z.string(),
  })).default([]),
  summary: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  needsHumanReview: z.boolean().default(false),
  iteration: z.number().int().default(0),
})

// 每个节点执行前后各校验一次
function createCheckedNode(name, schema, fn) {
  return async (state) => {
    const input = schema.parse(state)          // 进节点前：形状不对立刻报错
    const result = await fn(input)
    return schema.parse({ ...input, ...result.state })  // 出节点后：别把脏数据传给下游
  }
}
```

这样做换来三个好处：

- **报错位置前移**：节点 B 写出脏数据，在 B 的出口就炸，而不是三个节点之后莫名其妙地错
- **自文档化**：Schema 本身就是"这张交接单长什么样"的说明
- **重构安全**：改字段时，所有用到它的节点立刻能被找出来

> ⚠️ **常见误解**："JS 是动态语言，类型约束是负担。" 恰恰相反——越是动态语言，跨模块共享的可变数据越需要显式契约。Python 生态的 LangGraph 用 TypedDict/Pydantic 干的就是这件事，不是框架癖好，是刚需。

---

## 原则三：分片——按"谁来写"拆分 State

当节点变多，一张大交接单还是会乱。解法是把 State 按**写入方**分片：

```javascript
// ✅ 分片设计：每个片区有明确的"属主节点"
const state = {
  intake: {        // 只有 intake 节点写
    query: '',
    queryType: null,
  },
  research: {      // 只有 search/merge 节点写
    sources: [],
    dedupedCount: 0,
  },
  drafting: {      // 只有 write/evaluate 节点写
    summary: null,
    confidence: null,
    iteration: 0,
  },
  review: {        // 只有 human-review 节点写
    approved: false,
    reviewerNote: null,
  },
}
```

分片带来的秩序：

- **每个片区只有一个（或一组）写入者**，出问题时知道去找谁
- **节点只读自己需要的片区**，节点之间的耦合面肉眼可见
- **可以按片区做权限**：比如 `review` 片区只允许人工节点写，LLM 节点写了直接报错——这是一种廉价的 Guardrail（呼应 [2.15](/ch2-build-products/guardrails)）

> 💡 判断分片对不对的简单方法：随便指一个字段，你能不能立刻说出"谁会写它、谁会读它"？答不上来，说明分片（或最小化）没做好。

---

## 原则四：合并策略——并行节点写同一字段怎么办

[4.12](./workflow-orchestration)讲过并行节点。但并行有个隐藏炸弹：**三个并行节点同时写 `state.sources`，最后算谁的？**

默认的 `{ ...state, ...result }` 合并是"后者覆盖前者"，并行场景下结果取决于谁先跑完——**不确定行为**，这是黑盒的温床。

解法是给字段定义**显式的合并函数（Reducer）**：

```javascript
// ✅ 每个字段声明自己的合并方式
const reducers = {
  // 数组字段：拼接 + 去重，而不是覆盖
  sources: (oldVal = [], newVal = []) => {
    const seen = new Set(oldVal.map(s => s.url))
    return [...oldVal, ...newVal.filter(s => !seen.has(s.url))]
  },
  // 计数字段：累加
  searchCalls: (oldVal = 0, newVal = 0) => oldVal + newVal,
  // 标量字段：后者覆盖（但要显式声明，而不是默认行为）
  summary: (oldVal, newVal) => newVal ?? oldVal,
}

function mergeState(state, partial) {
  const merged = { ...state }
  for (const [key, newVal] of Object.entries(partial)) {
    const reducer = reducers[key]
    merged[key] = reducer ? reducer(state[key], newVal) : newVal
  }
  return merged
}
```

> 💡 LangGraph 里每个 State 字段都可以挂一个 reducer，干的就是这件事。理解了"为什么要显式合并"，你就理解了这类框架一半的设计动机。

**经验法则**：数组类字段几乎总是要自定义合并（拼接/去重），标量字段默认覆盖即可。并行节点往同一数组里追加结果，是最常见的 reducer 场景。

---

## 节点的职责边界：一个节点只干一件事

State 设计好了，节点怎么切？三条边界：

1. **一个节点 = 一个原子职责**。"搜索 + 去重 + 写摘要"塞在一个节点里，你就失去了单独重试"搜索"、单独测试"摘要"的能力。拆开。
2. **节点内部可以是一个小 ReAct Agent**。节点是"图"的层面，ReAct 是"循环"的层面，两层不冲突（呼应 [4.12](./workflow-orchestration) 和 [4.15 四层嵌套](./engineer-roles)）。一个"调研节点"内部让模型自主搜好几轮，完全合理——图的确定性管节点之间，循环的灵活性管节点内部。
3. **节点只通过 State 通信，不许有暗线**。节点 A 把数据写进模块级全局变量、节点 B 去读——这种"偷偷传话"绕过了 Schema、绕过了检查点、绕过了可观测性，是黑盒的头号来源。

> ⚠️ **常见误解**："节点切得越细越好。" 过细的节点让每个 LLM 调用都缺少上下文（一个只有一行职责的节点，模型看不到全局），且调度开销变大。切分标准是**独立可测试、独立可重试**，不是越碎越好。

---

## 边的设计：让控制流"可审计"

边的核心问题只有一个：**某个节点之后走哪条路，这个决定是谁做的？**

| 决定方式 | 适合 | 风险 |
|---------|------|------|
| **无条件边**（A 完必然到 B） | 主干流程 | 无 |
| **代码条件边**（`if (state.confidence > 0.9)`） | 规则明确的路由 | 无，最推荐 |
| **LLM 路由边**（让模型判断走哪条路） | 规则说不清的分类 | 不可预测，必须配合兜底 |

LLM 路由边的正确姿势——**把模型的自由裁量限制在枚举里，并给默认值**：

```javascript
async function routeNode(state) {
  const answer = await llm.classify(state.query, {
    categories: ['needs_search', 'direct_answer', 'unclear'],
  })
  // ✅ 兜底：模型返回任何意料之外的值，都落到安全路径
  const next = ['needs_search', 'direct_answer'].includes(answer)
    ? answer
    : 'needs_search'
  return { state: { routeReason: answer }, next }
}
```

> 💡 这和 [1.14 结构化输出](/ch1-llm-engineering/structured-output)是同一思想在"边"上的应用：**凡是要进控制流的模型输出，必须结构化、必须枚举、必须兜底。**

---

## 常见反模式清单

| 反模式 | 症状 | 解法 |
|-------|------|------|
| **上帝 State** | State 几十个字段，没人说得清全貌 | 原则一（最小化）+ 原则三（分片） |
| **裸合并** | 并行结果偶尔丢失，无法复现 | 原则四（显式 reducer） |
| **暗线通信** | 改一个节点，远处莫名炸掉 | 只许通过 State 通信 |
| **无条件大循环** | 节点互相指来指去，跑飞 | 循环必须有计数器和退出条件（[4.12 检查点循环](./workflow-orchestration)） |
| **LLM 裸路由** | 模型偶尔返回幻觉路径名，流程崩掉 | 枚举 + 兜底 |
| **巨型节点** | 一个节点几百行，没法单独测 | 按"独立可重试"拆分 |

---

## 框架对照：LangGraph 在做什么

理解了上面的原则，再看 LangGraph 这类框架，它的核心抽象你就全认识了：

| 框架概念 | 对应本节 |
|---------|---------|
| `StateGraph` + State 类型定义 | 原则二（类型约束） |
| 字段级 reducer（如 `Annotated[list, add]`） | 原则四（合并策略） |
| `addNode` / `addEdge` / `addConditionalEdges` | 节点边界 + 可审计的边 |
| Checkpointer（SqliteSaver 等） | [4.12 状态持久化](./workflow-orchestration) |
| `interrupt`（中断等人工） | 人机回环节点 |

> ⚠️ 框架不替你做的恰恰是本节的重点：**State 里放什么、节点怎么切，是你的设计决策，框架只提供机制。** 这也是[4.8](./harness-engineering)那句"先理解零件再用框架"在这里的回响——拿着本节的原则去用 LangGraph，你是在设计；不理解就直接上，你是在碰运气。

---

## 🛠️ 实战练习：给一个真实任务设计 State Schema

选一个你熟悉的多步任务（比如"竞品调研报告生成"：搜索 → 去重 → 提炼 → 写报告 → 人工审），完成：

1. **画节点**：列出 4–6 个节点，每个节点写一句话职责（写不出一句话的，说明它干了多件事）
2. **设计 Schema**：写出 State 的完整字段清单，每个字段标注：类型、哪个节点写、哪些节点读
3. **找并行点**：如果搜索要同时搜 3 个来源，写出 `sources` 字段的 reducer 合并函数
4. **加约束**：用 zod（或手写字段校验）把 Schema 落实成可运行的校验代码
5. **设兜底**：给"判断任务类型"的路由节点加上枚举 + 默认路径

**期望结果**：你得到一张"字段 × 节点"的读写关系表——拿这张表去对照实现，任何一个字段出问题，你都能立刻定位到唯一的写入节点。

**进阶挑战**：把 [4.12](./workflow-orchestration) 的 `PersistentWorkflow` 类拿过来，给它加上本节的 `createCheckedNode`（进出校验）和 `mergeState`（reducer 合并），得到一个带 Schema 校验和显式合并的最小工作流引擎。

---

## 📌 关键结论

1. State Schema 是节点间的"交接单"，系统变不变黑盒，主要取决于这张单子设计得清不清楚
2. 四条设计原则：最小化（三个判断标准）、类型约束（进出节点都校验）、分片（按写入方拆）、显式合并（reducer）
3. 节点按"独立可测试、独立可重试"切分，只通过 State 通信，拒绝暗线
4. 边要可审计：能用代码条件就不用 LLM 路由；用 LLM 路由必须枚举 + 兜底
5. 框架（LangGraph）提供机制，但 State 放什么、节点怎么切永远是你的设计决策——先懂原则，再用框架

---

下一节：[4.17 极简 Harness 解剖：Pi 的设计哲学](./pi-harness)
