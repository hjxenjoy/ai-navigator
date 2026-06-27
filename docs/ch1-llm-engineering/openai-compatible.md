# 1.9 OpenAI 兼容协议与多模型切换

你可能注意到了：本指南里调用 DeepSeek、阿里百炼、本地 Ollama，用的都是同一个 `openai` SDK，只是改了 `baseURL` 和模型名。这不是巧合——它们都遵循 **OpenAI 兼容协议**。理解这件事，能让你的代码"一次写好，随便换模型"。

## 什么是 OpenAI 兼容协议

OpenAI 的 API 接口（`/chat/completions`、`/embeddings` 这些）事实上成了行业标准。后来的大多数厂商——DeepSeek、通义、智谱、豆包、Kimi，包括本地的 Ollama——都提供了**和 OpenAI 一模一样的接口格式**。

这意味着：请求怎么发、返回长什么样、参数叫什么名字，都一致。你只需要换三样东西：

```
baseURL  →  指向哪家服务
apiKey   →  哪家的密钥
model    →  用哪个模型
```

业务代码（怎么组织 messages、怎么解析 `choices[0].message.content`）**完全不用改**。

> 💡 **类比**：就像各国插座标准不同，但 USB 接口全世界通用。OpenAI 协议就是大模型界的 USB——认准这个口，插哪家的"电源"都行。

---

## 一份配置，随处切换

把"连哪家"抽成配置，业务逻辑就和具体厂商解耦了：

```javascript
import OpenAI from "openai"

// —— 把后端配置集中在一处 ——
const PROVIDERS = {
  deepseek: {
    baseURL: "https://api.deepseek.com",
    apiKey: process.env.DEEPSEEK_API_KEY,
    model: "deepseek-v4-flash"
  },
  qwen: {
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKey: process.env.DASHSCOPE_API_KEY,
    model: "qwen-plus"
  },
  ollama: {
    baseURL: "http://localhost:11434/v1",
    apiKey: "ollama",          // 本地无需真实 key，占位即可
    model: "qwen2.5:14b"
  }
}

// 想换厂商？只改这一行
const cfg = PROVIDERS.deepseek

const client = new OpenAI({ baseURL: cfg.baseURL, apiKey: cfg.apiKey })

// 下面的业务代码对所有厂商都一样
const response = await client.chat.completions.create({
  model: cfg.model,
  messages: [{ role: "user", content: "你好" }]
})
console.log(response.choices[0].message.content)
```

这样做的好处：
- **比价/比效果**：同一段逻辑，换 `cfg` 就能对比不同模型的质量和成本
- **降级容灾**：主力厂商挂了/限流了，自动切到备用厂商
- **开发用本地、生产用云端**：开发时连 Ollama 免费跑，上线改成 DeepSeek

---

## 兼容不等于完全一致：注意这些坑

⚠️ "兼容 OpenAI"是说**大部分**一致，不是 100% 一致。常见差异：

| 方面 | 说明 |
|-----|-----|
| **特有参数** | 有的厂商有自家参数（如 `reasoning_effort`、思考开关），换厂商时可能不被支持或被忽略 |
| **Embedding 维度** | 不同厂商/模型的向量维度不同，**存进向量库的数据不能跨模型混用**（详见 [2.2 节](/ch2-build-products/embedding-search)） |
| **Tool Use 细节** | 工具调用大体一致，但严格程度、并行调用支持有差异；小模型可能根本不支持 |
| **返回字段** | 思考内容、用量统计等扩展字段，各家命名可能不同 |
| **限流/错误码** | 限流策略和错误码可能略有出入，重试逻辑要按实际厂商调 |

> ⚠️ **最重要的一条**：**Embedding 不能跨模型混用**。用 A 模型生成的向量存进库里，检索时也必须用 A 模型生成查询向量，换了模型整个库就得重建。

---

## Anthropic 是个例外

要注意：**Anthropic（Claude）官方 SDK 用的不是 OpenAI 协议**——它的接口是 `client.messages.create()`，返回 `content[0].text`，工具格式也不同。所以从 Claude 切到 DeepSeek，不是改 `baseURL` 那么简单，而是要换 SDK 和改解析代码（这就是本指南把示例从 Anthropic SDK 改成 OpenAI SDK 的原因）。

不过 Anthropic 也提供了一个 OpenAI 兼容端点用于过渡，多数国产模型则原生就是 OpenAI 风格。

---

## 📌 关键结论

1. 大多数厂商（含 Ollama）都兼容 OpenAI 协议，换模型只改 `baseURL` + `apiKey` + `model`
2. 把"连哪家"抽成配置，业务代码就和厂商解耦，方便比价、容灾、本地/云端切换
3. "兼容"是大部分一致，特有参数、工具细节、扩展字段仍有差异，要实测
4. Embedding 向量不能跨模型混用，换 Embedding 模型必须重建向量库
5. Anthropic 官方 SDK 是另一套协议，不在"改 baseURL 就能换"的范围内

---

下一节：[1.10 在本地跑模型（Ollama）](./local-models)
