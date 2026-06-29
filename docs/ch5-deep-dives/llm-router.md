# 5.21 LLM Router：让对的请求找到对的模型

你已经上线了一个 AI 功能，每天处理数千条请求。账单下来一看，大部分费用花在了"请帮我把这句话改得更正式"这类简单请求上——而这些请求根本不需要最强的模型。

LLM Router（模型路由器）要解决的就是这个问题：**自动识别请求的复杂度，把它发给最合适的模型**，在不损失质量的前提下大幅降低成本。

---

## 1. 动机：模型成本差异是真实的

不同能力的模型，价格差异可以达到 10–60 倍。以 Claude 系列为例（价格为示意，以官网为准）：

| 模型 | 输入价格（每百万 token） | 输出价格（每百万 token） | 适合场景 |
|---|---|---|---|
| Claude Haiku | ~$0.25 | ~$1.25 | 简单问答、格式转换、短文本分类 |
| Claude Sonnet | ~$3 | ~$15 | 代码生成、多步推理、中等复杂任务 |
| Claude Opus | ~$15 | ~$75 | 复杂分析、长文档理解、高精度推理 |

一个典型的 AI 产品请求分布大约是这样的：

- **60% 是简单请求**：改写、翻译、摘要、格式化、简单问答
- **30% 是中等请求**：代码生成、多步分析、有结构的报告
- **10% 是复杂请求**：需要深度推理、长链路思考、专业领域判断

如果全部使用 Sonnet，每月花费 $1000 的话；如果用路由器把简单请求发给 Haiku，**保守估计可以节省 40–60%**，每月省下 $400–$600。

> 💡 **类比**：LLM Router 就像机场的登机口分配。大型国际航班（复杂推理任务）去 C 区大登机口，国内短途（简单问答）去 A 区小登机口。如果所有航班都挤同一个登机口，浪费资源又增加拥堵。

---

## 2. 方案一：基于规则的路由（最简单）

最直接的思路：**写一套规则，根据请求特征决定模型**。不需要任何 AI 判断，延迟几乎为零。

**规则维度一：请求长度**

短请求通常是简单任务，长请求往往需要更强的上下文理解。

**规则维度二：关键词检测**

"分析竞争对手"、"评估方案优劣"——这类词出现，说明任务复杂；"翻译这段话"、"改写为正式语气"——这类词出现，小模型就够了。

```javascript
// rule-based-router.js
// 运行方式：node rule-based-router.js

const MODEL_CONFIG = {
  small: {
    id: 'claude-haiku-3-5',
    maxInputTokens: 4096,
    pricePerMToken: 0.25,
  },
  medium: {
    id: 'claude-sonnet-4-5',
    maxInputTokens: 16384,
    pricePerMToken: 3,
  },
  large: {
    id: 'claude-opus-4-5',
    maxInputTokens: 32768,
    pricePerMToken: 15,
  },
};

// 触发大模型的复杂任务关键词
const COMPLEX_KEYWORDS = [
  '分析', '评估', '对比', '推理', '判断', '规划', '设计架构',
  'analyze', 'evaluate', 'compare', 'reason', 'plan', 'architect',
  '为什么', '如何选择', '有什么区别', '优缺点',
];

// 明确属于简单任务的关键词
const SIMPLE_KEYWORDS = [
  '翻译', '改写', '摘要', '格式化', '总结一下', '帮我写一句',
  'translate', 'rewrite', 'summarize', 'format',
  '打个招呼', '生成标题', '纠正语法',
];

class RuleBasedRouter {
  route(message) {
    const text = message.toLowerCase();
    const tokenEstimate = this._estimateTokens(message);

    // 规则1：超长请求直接给大模型
    if (tokenEstimate > 3000) {
      return { modelId: MODEL_CONFIG.large.id, reason: '请求过长，需要大上下文窗口' };
    }

    // 规则2：复杂关键词检测
    const hasComplexKeyword = COMPLEX_KEYWORDS.some(kw => text.includes(kw.toLowerCase()));
    if (hasComplexKeyword) {
      return { modelId: MODEL_CONFIG.medium.id, reason: '检测到复杂任务关键词' };
    }

    // 规则3：简单关键词检测
    const hasSimpleKeyword = SIMPLE_KEYWORDS.some(kw => text.includes(kw.toLowerCase()));
    if (hasSimpleKeyword) {
      return { modelId: MODEL_CONFIG.small.id, reason: '检测到简单任务关键词' };
    }

    // 规则4：根据长度兜底
    if (tokenEstimate < 50) {
      return { modelId: MODEL_CONFIG.small.id, reason: '请求极短，小模型足够' };
    }

    // 默认走中等模型
    return { modelId: MODEL_CONFIG.medium.id, reason: '未匹配到规则，使用默认模型' };
  }

  _estimateTokens(text) {
    // 粗估：中文每字约1token，英文每4字符约1token
    const chineseChars = (text.match(/[一-鿿]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return chineseChars + Math.ceil(otherChars / 4);
  }
}

// 测试
const router = new RuleBasedRouter();
const testCases = [
  '帮我把这句话翻译成英文：今天天气不错',
  '分析一下 PostgreSQL 和 MongoDB 在高并发写入场景下的优缺点，并给出选型建议',
  '请帮我打个招呼',
  '为什么 Transformer 的 Attention 机制能捕捉长距离依赖？请详细推理',
];

for (const msg of testCases) {
  const result = router.route(msg);
  console.log(`消息："${msg.slice(0, 20)}..."`);
  console.log(`→ 路由到：${result.modelId}，原因：${result.reason}\n`);
}
```

**这个方案的缺点**：关键词列表很难维护，覆盖不全。"帮我做一个深度的市场调研"——没有命中关键词，但明显是复杂任务。

---

## 3. 方案二：让小模型判断难度

> ⚠️ **常见误解**：用 AI 判断复杂度会很贵。——错。用最便宜的 Haiku 做分类，每次判断大约花费 **$0.0001**，比节省下来的成本低了 100 倍。

思路：**在真正调用大模型之前，先用小模型跑一个分类任务**，判断请求难度（0–10分），再根据分数路由。

```javascript
// classifier-router.js
// 需要：npm install @anthropic-ai/sdk
// 环境变量：ANTHROPIC_API_KEY

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL_CONFIG = {
  classifier: 'claude-haiku-3-5',  // 永远用最便宜的做分类
  simple: 'claude-haiku-3-5',
  medium: 'claude-sonnet-4-5',
  complex: 'claude-opus-4-5',
};

const COMPLEXITY_THRESHOLDS = {
  simple: 3,   // 0–3 分用小模型
  medium: 7,   // 4–7 分用中等模型
  // 8–10 分用大模型
};

class ClassifierRouter {
  async route(message) {
    const startTime = Date.now();

    // 第一步：用小模型判断复杂度（花费极低）
    const classifyPrompt = `你是一个请求复杂度评估器。
请评估以下用户请求的复杂度，输出一个 0–10 的整数分数，不要输出其他内容。

评分标准：
- 0–3：极简单（打招呼、简单翻译、格式化、一句话总结）
- 4–7：中等（代码生成、多步分析、有结构的报告）
- 8–10：复杂（需要深度推理、专业知识、长链路思考）

用户请求：
${message}

只输出数字（0–10）：`;

    const classifyResponse = await client.messages.create({
      model: MODEL_CONFIG.classifier,
      max_tokens: 5,
      messages: [{ role: 'user', content: classifyPrompt }],
    });

    const scoreText = classifyResponse.content[0].text.trim();
    const score = parseInt(scoreText, 10);
    const classifyLatency = Date.now() - startTime;

    // 第二步：根据分数路由
    let targetModel;
    if (score <= COMPLEXITY_THRESHOLDS.simple) {
      targetModel = MODEL_CONFIG.simple;
    } else if (score <= COMPLEXITY_THRESHOLDS.medium) {
      targetModel = MODEL_CONFIG.medium;
    } else {
      targetModel = MODEL_CONFIG.complex;
    }

    return {
      modelId: targetModel,
      complexityScore: score,
      classifyLatency,
      reason: `复杂度评分 ${score}/10`,
    };
  }
}

// 测试
async function main() {
  const router = new ClassifierRouter();

  const testMessages = [
    '帮我把"我爱你"翻译成法语',
    '写一个 Node.js 中间件，用于 JWT 验证，要求支持 RSA 和 HMAC 两种算法',
    '分析当前 AI 芯片市场格局，英伟达、AMD、英特尔的竞争态势，以及国内玩家的机会窗口',
  ];

  for (const msg of testMessages) {
    const result = await router.route(msg);
    console.log(`消息："${msg.slice(0, 30)}..."`);
    console.log(`→ 复杂度：${result.complexityScore}/10，路由到：${result.modelId}`);
    console.log(`→ 分类耗时：${result.classifyLatency}ms\n`);
  }
}

main().catch(console.error);
```

**权衡**：每次请求多了 150–250ms 的分类延迟，以及约 $0.0001 的分类成本。但如果因此避免了一次 Opus 调用（省下约 $0.05），ROI 是 500:1。

---

## 4. 方案三：基于 Embedding 相似度的路由

> 💡 **类比**：这就像图书馆的书籍分类。你预先把一批书标注为"简单"或"复杂"，新来一本书就找它最像哪批书，然后沿用那批书的分类。

规则路由覆盖不全，分类器需要额外延迟。Embedding 路由的思路是：**预先标注一批例子，新请求找最近邻**。

```javascript
// embedding-router.js（核心逻辑精简版）
// 需要：npm install @anthropic-ai/sdk

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 预先标注的例子库
const LABELED_EXAMPLES = [
  { text: '帮我翻译这段话', label: 'simple' },
  { text: '把这封邮件改得更正式', label: 'simple' },
  { text: '给这篇文章加个标题', label: 'simple' },
  { text: '写一个 React 组件，实现无限滚动', label: 'medium' },
  { text: '解释这段 SQL 并优化它的性能', label: 'medium' },
  { text: '设计一个分布式任务队列的架构方案', label: 'complex' },
  { text: '分析这份财务报告并给出投资建议', label: 'complex' },
];

const MODEL_MAP = {
  simple: 'claude-haiku-3-5',
  medium: 'claude-sonnet-4-5',
  complex: 'claude-opus-4-5',
};

// 计算两个向量的余弦相似度（无需理解数学，就是"两个方向有多像"）
function cosineSimilarity(vecA, vecB) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] ** 2;
    normB += vecB[i] ** 2;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function getEmbedding(text) {
  // 实际项目中可以用 OpenAI text-embedding-3-small 或其他 Embedding 服务
  // 这里用伪代码示意结构
  // const response = await openaiClient.embeddings.create({ model: 'text-embedding-3-small', input: text });
  // return response.data[0].embedding;

  // 真实项目请替换为实际 Embedding API 调用
  throw new Error('请接入实际的 Embedding API（如 OpenAI text-embedding-3-small）');
}

class EmbeddingRouter {
  constructor() {
    this.exampleEmbeddings = null; // 启动时预计算
  }

  async initialize() {
    console.log('预计算例子库的 Embedding...');
    this.exampleEmbeddings = await Promise.all(
      LABELED_EXAMPLES.map(async (ex) => ({
        ...ex,
        embedding: await getEmbedding(ex.text),
      }))
    );
    console.log('初始化完成');
  }

  async route(message) {
    const queryEmbedding = await getEmbedding(message);

    // 找最相似的 K 个例子（K=3）
    const similarities = this.exampleEmbeddings.map((ex) => ({
      label: ex.label,
      similarity: cosineSimilarity(queryEmbedding, ex.embedding),
    }));

    similarities.sort((a, b) => b.similarity - a.similarity);
    const topK = similarities.slice(0, 3);

    // 投票决定标签
    const votes = { simple: 0, medium: 0, complex: 0 };
    for (const { label } of topK) votes[label]++;
    const winnerLabel = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];

    return {
      modelId: MODEL_MAP[winnerLabel],
      label: winnerLabel,
      topNeighbors: topK,
    };
  }
}
```

**这个方案的适用场景**：当你已经积累了几百条标注数据，规则和分类器都不准时，Embedding 路由的准确率通常最高。

---

## 5. 实战：生产环境路由器实现

生产环境需要把三种方案结合起来，并加入**缓存**和**监控**：

```javascript
// production-router.js
// 完整生产级实现
// 需要：npm install @anthropic-ai/sdk
// 环境变量：ANTHROPIC_API_KEY

import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODELS = {
  small:  { id: 'claude-haiku-3-5',  inputPrice: 0.25,  outputPrice: 1.25 },
  medium: { id: 'claude-sonnet-4-5', inputPrice: 3,     outputPrice: 15   },
  large:  { id: 'claude-opus-4-5',   inputPrice: 15,    outputPrice: 75   },
};

// 始终强制用大模型的场景（黑名单）
const FORCE_LARGE_PATTERNS = [
  /法律|合同|条款|liability|legal/i,
  /医疗|诊断|用药|medical|diagnosis/i,
  /财务规划|投资建议|investment advice/i,
];

// 始终用小模型的场景（白名单）
const FORCE_SMALL_PATTERNS = [
  /^(翻译|translate)[：:]/i,
  /^(改写|rewrite)[：:]/i,
  /帮我(打个招呼|问好|say hello)/i,
];

class ProductionRouter {
  constructor() {
    this._cache = new Map();   // 简单内存缓存，生产中换成 Redis
    this._routingLog = [];     // 路由决策日志
  }

  async route(message, context = {}) {
    const startTime = Date.now();

    // 第一步：缓存命中（相同问题不重复判断）
    const cacheKey = crypto.createHash('md5').update(message).digest('hex');
    if (this._cache.has(cacheKey)) {
      const cached = this._cache.get(cacheKey);
      return { ...cached, fromCache: true };
    }

    // 第二步：黑名单检查（高风险场景强制大模型）
    for (const pattern of FORCE_LARGE_PATTERNS) {
      if (pattern.test(message)) {
        return this._buildResult(MODELS.large, '高风险场景强制大模型', message, startTime);
      }
    }

    // 第三步：白名单检查（明确简单场景直接小模型）
    for (const pattern of FORCE_SMALL_PATTERNS) {
      if (pattern.test(message)) {
        return this._buildResult(MODELS.small, '明确简单场景', message, startTime, cacheKey);
      }
    }

    // 第四步：用小模型分类复杂度
    const score = await this._classifyComplexity(message);

    let model;
    if (score <= 3)      model = MODELS.small;
    else if (score <= 7) model = MODELS.medium;
    else                 model = MODELS.large;

    const result = this._buildResult(model, `复杂度评分 ${score}/10`, message, startTime, cacheKey);
    return result;
  }

  async _classifyComplexity(message) {
    const response = await client.messages.create({
      model: MODELS.small.id,
      max_tokens: 5,
      messages: [{
        role: 'user',
        content: `评估请求复杂度，只输出 0–10 的整数，不要其他文字。
0–3=简单（翻译/改写/格式化），4–7=中等（代码/分析），8–10=复杂（深度推理/专业判断）

请求：${message}

分数：`,
      }],
    });
    const score = parseInt(response.content[0].text.trim(), 10);
    return isNaN(score) ? 5 : Math.max(0, Math.min(10, score));
  }

  _buildResult(model, reason, message, startTime, cacheKey = null) {
    const tokenEstimate = Math.ceil(message.length / 2);
    const estimatedCost = (tokenEstimate / 1_000_000) * model.inputPrice;

    const result = {
      modelId: model.id,
      reason,
      estimatedCost: `$${estimatedCost.toFixed(6)}`,
      latency: Date.now() - startTime,
      fromCache: false,
    };

    // 写入缓存
    if (cacheKey) {
      this._cache.set(cacheKey, result);
      // 实际场景设置过期时间（例如 1 小时）
    }

    // 记录路由决策（用于后续分析）
    this._routingLog.push({
      timestamp: new Date().toISOString(),
      messagePreview: message.slice(0, 50),
      ...result,
    });

    return result;
  }

  // 获取路由统计：用于监控和优化
  getStats() {
    const total = this._routingLog.length;
    if (total === 0) return { message: '暂无路由记录' };

    const modelCounts = {};
    for (const log of this._routingLog) {
      modelCounts[log.modelId] = (modelCounts[log.modelId] || 0) + 1;
    }

    const distribution = Object.entries(modelCounts).map(([modelId, count]) => ({
      modelId,
      count,
      percentage: ((count / total) * 100).toFixed(1) + '%',
    }));

    return { total, distribution };
  }
}

// 测试
async function main() {
  const router = new ProductionRouter();

  const testCases = [
    { message: '帮我打个招呼给我的同事' },
    { message: '翻译：The quick brown fox jumps over the lazy dog' },
    { message: '写一个防抖函数，要求支持立即执行模式，并附上单元测试' },
    { message: '医疗：我最近头疼，需要吃什么药？' },
    { message: '对比分析 GPT-4、Claude 3 和 Gemini 在代码生成任务上的优缺点，并给出企业选型建议' },
  ];

  console.log('=== 生产路由器测试 ===\n');
  for (const { message } of testCases) {
    const result = await router.route(message);
    console.log(`请求："${message.slice(0, 35)}..."`);
    console.log(`→ 模型：${result.modelId}`);
    console.log(`→ 原因：${result.reason}，预估成本：${result.estimatedCost}，耗时：${result.latency}ms\n`);
  }

  console.log('=== 路由统计 ===');
  console.log(router.getStats());
}

main().catch(console.error);
```

---

## 6. 效果测量：省钱不等于质量下降

路由器上线后，最重要的问题是：**小模型接手的那些请求，质量有没有变差？**

### 推荐的测量方法

**A/B 测试**

把 10% 的流量设为对照组（全走大模型），90% 走路由器。对比两组的用户满意度/任务完成率。

```javascript
// 路由决策时附带 A/B 实验分组
async function routeWithABTest(message) {
  const isControlGroup = Math.random() < 0.1; // 10% 对照组
  if (isControlGroup) {
    return { modelId: MODELS.large.id, reason: 'A/B 对照组', group: 'control' };
  }
  const result = await router.route(message);
  return { ...result, group: 'experiment' };
}
```

**关键指标**

| 指标 | 说明 | 目标 |
|---|---|---|
| 路由准确率 | 复杂任务有没有被误判为简单 | > 95% |
| 成本节省比 | 与全量大模型相比节省了多少 | > 40% |
| 质量回归率 | 因路由错误导致的差回复比例 | < 1% |
| 平均路由延迟 | 分类本身增加的延迟 | < 300ms |

---

🛠️ **实战练习**

**目标**：估算你的项目如果引入路由器，每月能节省多少成本。

**步骤**：

1. **收集请求样本**：从你的日志里找最近 100 条发给 LLM 的请求（或手动构造代表性样本）。

2. **手动标注复杂度**：给每条请求标注 simple / medium / complex，统计各类比例。

3. **运行 RuleBasedRouter**：把样本跑一遍，看路由结果和你的手动标注差多少，计算准确率。

4. **计算成本节省**：
```javascript
// 成本估算脚本
const requests = [
  // 填入你的请求样本
  { text: '帮我翻译...', manualLabel: 'simple', avgTokens: 80 },
  { text: '分析...', manualLabel: 'complex', avgTokens: 500 },
  // ...
];

const priceMap = {
  simple:  { input: 0.25,  output: 1.25  },
  medium:  { input: 3,     output: 15    },
  complex: { input: 15,    output: 75    },
};

// 假设全走 medium（当前状态）
const currentCost = requests.reduce((sum, r) => {
  return sum + (r.avgTokens / 1_000_000) * priceMap.medium.input;
}, 0);

// 假设路由后按标注分配模型
const routedCost = requests.reduce((sum, r) => {
  return sum + (r.avgTokens / 1_000_000) * priceMap[r.manualLabel].input;
}, 0);

const monthlySaving = (currentCost - routedCost) * 30 * (/* 日请求数 */ 1000);
console.log(`当日成本（全 medium）：$${currentCost.toFixed(4)}`);
console.log(`当日成本（路由后）：$${routedCost.toFixed(4)}`);
console.log(`月节省估算：$${monthlySaving.toFixed(2)}`);
```

**期望结果**：得出一张表格，清晰显示"如果使用路由，每月可节省 $X，节省比例 Y%"。

**进阶挑战**：在节省成本的基础上，找出 5 条你认为被误路由（小模型接手但实际上需要大模型）的请求，分析原因，优化路由规则。

---

## 📌 关键结论

1. **成本差异是真实可利用的**：小模型和大模型价格相差 10–60 倍，但大多数产品中有 60% 的请求小模型完全能处理，混合路由可节省 40–60% 成本。

2. **三种路由策略各有适用场景**：规则路由零延迟适合明确的黑白名单；分类器路由准确度更高但加 200ms 延迟；Embedding 路由适合有标注数据后的精准分类。

3. **生产路由器必须有黑名单保底**：法律、医疗、金融等高风险场景不应被路由到小模型，无论复杂度分数多低，宁可多花钱，不能出错。

4. **没有监控的路由是盲目的**：必须记录每次路由决策，定期分析路由准确率和质量指标，用 A/B 测试证明路由没有损失质量。

---

下一节：[5.22 合成数据生成：用 AI 造训练数据](./synthetic-data)
