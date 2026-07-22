# 0.5 国产大模型生态

> 🕐 内容截至 2026-07

上一节的技术版图偏国际视角。但如果你在国内做工程，**真正每天会调用、会付费、能拿来跑的，大概率是国产模型**——它们更便宜、网络更稳、合规更省心。这一节帮你建立一张国产模型的地图。

先说清楚：这是一张 **2026 年中的快照**，型号和排名几个月后就会变。值得带走的是"怎么选、怎么接"的看法，而不是具体事实——看法比事实重要。

## 为什么国产模型值得优先考虑

- **便宜**：同样的任务，国产模型 API 价格通常是 GPT/Claude 的几分之一到几十分之一
- **网络稳定**：不用处理跨境网络、区域限制
- **中文能力强**：训练数据里中文占比高，中文任务上往往不输甚至更好
- **大多兼容 OpenAI 协议**：换模型只改 `baseURL` 和模型名，代码几乎不动（详见 [1.9 OpenAI 兼容协议](/ch1-llm-engineering/openai-compatible)）

---

## 主要玩家一览

> ⚠️ 模型版本变化极快，下表是 2026 年中的大致情况，具体型号和上下文长度请以各家最新文档为准。重点记住**每家的定位和接入方式**，而不是背版本号。

| 提供商 | 代表模型 | 上下文 | OpenAI 兼容 | 有 Embedding | 定位 |
|-------|---------|-------|:---:|:---:|------|
| **深度求索 DeepSeek** | DeepSeek-V4（flash/pro） | 1M | ✅（兼 Anthropic 协议） | ❌ | 性价比极高、代码与推理强、MIT 开源权重 |
| **阿里 通义千问 Qwen** | Qwen3.7-Max（旗舰闭源）+ 开源垂类系列 | 最高 1M | ✅ | ✅ `text-embedding-v4` | 生态最全、模型矩阵最大；旗舰转向闭源 |
| **智谱 GLM** | GLM-5.2 | 1M | ✅ | ✅ `embedding-3` | MIT 开源权重，编程基准追近闭源旗舰 |
| **字节 豆包 Doubao** | Doubao-Seed-2.0 | 长 | ✅ | ✅ `doubao-embedding` | 价格激进、火山引擎生态 |
| **月之暗面 Kimi** | Kimi K3（2026-07 发布） | 1M | ✅ | 部分 | 长文档、综合能力强；2.8T 参数 MoE |
| **MiniMax** | MiniMax-Text 系列 | 最高 4M | 部分 | ✅ | 超长上下文、多模态 |
| **百度 文心** | 文心一言（千帆平台） | 长 | ✅（兼容模式） | ✅ | 企业生态、合规 |

2026 年上半年的三个关键变化：

- **开源权重追近闭源旗舰**：DeepSeek V4（2026-04，MIT 协议）、GLM-5.2（2026-06，MIT 协议）在编程基准上首次追近 GPT/Claude 旗舰；Kimi K3（2026-07-16 发布，2.8T 参数 MoE）官方已宣布将于 7 月下旬开放权重，届时将是参数规模最大的开源权重模型
- **Qwen 旗舰转向闭源**：Qwen3.7-Max（2026 年中发布）不再开放权重，只走 API；开源线继续覆盖垂类和中小尺寸模型
- **协议兼容更进一步**：DeepSeek API 同时兼容 OpenAI 和 Anthropic 两套协议；旧别名 `deepseek-chat` / `deepseek-reasoner` 于 2026-07-24 弃用，请直接用 `deepseek-v4-flash` / `deepseek-v4-pro`

---

## 怎么选

**优先级建议（普通工程项目）：**

1. **DeepSeek** —— 默认首选。便宜、代码强、稳定，OpenAI 兼容，本指南所有实战代码都用它。
2. **通义千问（阿里百炼）** —— 需要 Embedding、多模态、或想要最全的模型矩阵时。
3. **智谱 GLM / 豆包** —— 需要更强推理（GLM）或更低价格（豆包）时备选。

> 💡 **类比**：就像云服务商你不会七家都用，选一个主力（比如 DeepSeek）+ 一个补位（比如阿里百炼补 Embedding 和多模态）就够了，把这两家的特性摸透。

---

## 聚合平台：一个 Key 调所有模型

如果你不想在每家都注册、充值、管 Key，可以用**聚合平台**——它们用一套 OpenAI 兼容接口转发到背后几十个模型：

- **硅基流动 SiliconFlow** —— 国内常用，聚合了 DeepSeek、Qwen、GLM 等，有免费额度
- **OpenRouter** —— 国际聚合平台，模型最全（含国产+国际）

聚合平台的好处是**切模型零成本**（只改模型名），坏处是多一层中间商、可能有额外延迟和加价。适合做模型对比测试，或者不想维护多个账号时。

---

## 接入信息速查

下面是几家 OpenAI 兼容接口的 `baseURL`，配合 OpenAI SDK 直接用（详见 [1.9 节](/ch1-llm-engineering/openai-compatible)）：

```javascript
// DeepSeek
baseURL: "https://api.deepseek.com"            // 模型：deepseek-v4-flash / deepseek-v4-pro

// 阿里百炼（通义千问 + Embedding）
baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1"  // 模型：qwen-plus / text-embedding-v4

// 智谱 GLM
baseURL: "https://open.bigmodel.cn/api/paas/v4"  // 模型：glm-5.2 / embedding-3

// 火山引擎（豆包）
baseURL: "https://ark.cn-beijing.volces.com/api/v3"  // 模型：doubao-... / doubao-embedding

// 月之暗面 Kimi
baseURL: "https://api.moonshot.cn/v1"            // 模型：kimi-k3 等
```

---

## 📌 关键结论

1. 国内做工程优先考虑国产模型：更便宜、网络更稳、中文强、大多兼容 OpenAI 协议
2. 默认主力选 DeepSeek，需要 Embedding/多模态时用阿里百炼补位
3. 不想管多个账号，可以用硅基流动、OpenRouter 这类聚合平台，一个 Key 调所有模型
4. 2026 年的格局：开源权重模型（DeepSeek V4、GLM-5.2、Kimi K3）在编程上追近闭源旗舰，1M 上下文成标配；Qwen 旗舰则转向闭源
5. 不要纠结版本号，记住每家的定位和接入方式即可——版本几个月就换一轮

---

下一节：[0.6 炒作周期复盘：哪些 AI 技术已经退潮](./hype-cycle)
