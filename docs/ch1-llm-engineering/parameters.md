# 1.3 生成参数详解

这些参数控制 AI"怎么生成"文字，理解它们能帮你在不同场景下调出更好的效果。

## Temperature（温度）：控制随机性

这是最常被误解的参数。

**Temperature 不是"思考深度"，是"随机程度"。**

AI 每次生成一个 Token，其实是从所有可能的词里按概率选一个。Temperature 控制这个选择有多随机：

```
Temperature = 0：每次都选概率最高的那个词 → 输出很稳定，但可能显得死板
Temperature = 1：按原始概率随机选 → 正常状态
Temperature = 2：放大随机性 → 输出更"创意"，但也更容易出错
```

> 💡 **类比**：你写作文，Temperature 低 = 你总是用最常见、最保险的词；Temperature 高 = 你更愿意用奇特的词，文章更有个性，但可能也更容易写出奇怪的句子。

**实际使用建议：**

| 场景 | 推荐 Temperature |
|-----|----------------|
| 写代码、数据提取 | 0 ~ 0.3（要稳定、准确） |
| 回答问题、写文档 | 0.5 ~ 0.7（正常） |
| 写文案、头脑风暴 | 0.8 ~ 1.2（要创意） |

---

## Top-P 和 Top-K：缩小候选范围

这两个参数控制"每次生成下一个词时，从多大的候选池里选"。

**Top-K**：只从概率最高的 K 个词里选。

```
假设下一个词的候选：
"猫" 40%
"狗" 30%
"鸟" 20%
"鱼" 8%
"树" 2%

Top-K = 3 时：只从"猫/狗/鸟"里选，砍掉了"鱼"和"树"
```

**Top-P**：从概率累计到 P% 为止的候选词里选（英文叫 Nucleus Sampling，这个名字来自数学概念，你不需要管它为什么叫这个名字）。

```
Top-P = 0.9 时：从概率加起来到 90% 的词里选
（上例中：猫40% + 狗30% + 鸟20% = 90%，选这三个）
```

**实际使用：**
- 大多数情况下保持默认值就好
- 如果觉得输出太"发散"，降低 Top-P（比如 0.7）
- Top-K 和 Top-P 通常只用一个，不同时调

---

## Max Tokens：最大输出长度

控制 AI 最多生成多少 Token 的回复。

⚠️ 注意：这个是**上限**，不是"让 AI 生成这么多"。如果 AI 完成了任务，它会自然停止，不会强行凑满。

如果 AI 的回复被截断（中途停了），通常是 Max Tokens 设得太低了。

---

## Stop Sequence：让 AI 在特定词处停止

你可以设置一些"停止符"，当 AI 生成到这个词时，立刻停止输出。

**常见用途：**
```javascript
// 只让 AI 生成 JSON，遇到 ``` 就停
stopSequences: ["```"]

// 生成多个条目，每个用 ### 分隔，只需要第一个
stopSequences: ["###"]
```

---

## Seed：让输出可复现

设置相同的 Seed 值 + 相同的 Prompt + 相同的参数 → 大概率得到相同的输出。

**什么时候用：**
- 调试时，你想复现一个特定的输出
- 测试时，你想让结果稳定可比较

注意：不同模型版本之间，即使相同 Seed 也不保证相同输出。

---

## Streaming（流式输出）

你已经理解这个了。Streaming = AI 生成一个 Token 就立刻发给客户端，而不是等全部生成完才发送。

**为什么大多数场景要用 Streaming：**
- 用户体验好，不用盯着空白等
- 对于长回复，减少"首字等待时间"（Time to First Token）
- 出错了可以提前看到，不用等到最后

---

---

## 🛠️ 实战练习：Temperature 对比实验

用同一个 Prompt，分别用不同 Temperature 调用 API，观察输出差异：

```javascript
import OpenAI from "openai"

// —— 后端配置（换模型/换服务只改这里）——
// 默认：DeepSeek 云端 API
const client = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY
})
const MODEL = "deepseek-v4-flash"

// 替代方案：本地 Ollama（先运行 `ollama serve`，完全离线免费）
// const client = new OpenAI({ baseURL: "http://localhost:11434/v1", apiKey: "ollama" })
// const MODEL = "qwen2.5:14b"   // 或 "gemma4:12b"

const prompt = "给我写一个函数名，这个函数的作用是：把用户列表按注册时间排序"

async function testTemperature(temp) {
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 50,
    temperature: temp,
    messages: [{ role: "user", content: prompt }]
  })
  console.log(`Temperature ${temp}: ${response.choices[0].message.content.trim()}`)
}

// 跑5次，每次用不同的 temperature
for (const temp of [0, 0.3, 0.7, 1.0, 1.5]) {
  await testTemperature(temp)
}
```

**运行之前准备**：先 `npm install openai`，再设置环境变量 `DEEPSEEK_API_KEY`（用本地 Ollama 则不需要 key）。DeepSeek 和 Ollama 都兼容 OpenAI 协议，所以同一份代码只要改最上面的 `baseURL` 和 `MODEL` 就能在云端和本地间切换。

**观察要点**：
- Temperature = 0 时，多次运行是否总是同一个答案？
- Temperature = 1.5 时，答案是否有时候显得"奇怪"？
- 哪个 Temperature 的结果最符合你的期望？

---

## 📌 参数速查表

| 参数 | 作用 | 常用取值 |
|-----|-----|---------|
| temperature | 随机性/创意度 | 代码: 0.2，对话: 0.7，创意: 1.0 |
| top_p | 候选词范围（概率） | 通常 0.9，不稳定时降到 0.7 |
| top_k | 候选词数量 | 通常不手动设置 |
| max_tokens | 最大输出长度 | 根据任务设置，不要卡太死 |
| stop | 停止符 | 需要精确控制输出结构时用 |
| seed | 随机种子 | 调试和测试时用 |
| stream | 流式输出 | 几乎所有用户交互场景都应开启 |

---

下一节：[1.4 Tool Use 深度使用](./tool-use)
