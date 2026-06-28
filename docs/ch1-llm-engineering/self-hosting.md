# 1.13 自托管推理：把开源模型跑上生产

[1.10](./local-models) 用 Ollama 在本地把模型跑起来——那是给**一个人、调试用**的。但当你要让一个开源模型扛**生产流量**（很多用户同时用、要低延迟、要高吞吐），Ollama 就不够了。这一节讲怎么把开源模型部署成一个能打的生产推理服务。

> 💡 **类比**：Ollama 像家用轿车——自己开、够用、好上手。生产推理服务像运营一支**网约车队**：同时要接很多单，得有调度（谁先上车）、拼车（一趟多拉几个人）、车位管理（不让座位空着跑）。同样是"把人从 A 送到 B"，但要的是**吞吐和利用率**，不是单程舒适。你不用懂引擎内部，但要知道"车队"和"私家车"是两套玩法。

## 为什么 Ollama 扛不住生产

Ollama 默认偏向"单请求顺畅"，并发一上来就露怯：请求基本排队串行、GPU 经常空转、没有为高吞吐优化的批处理。少数几个人用没问题，几十上百路并发就会延迟飙升、显卡利用率却很低。

生产级推理引擎专门解决这个，事实标准是 **[vLLM](https://github.com/vllm-project/vllm)**（同类还有 SGLang、TGI）。它能在同样的显卡上把吞吐拉高几倍到几十倍，靠的是两个关键机制——

---

## 两个让吞吐起飞的机制（知道是什么就行）

- **Continuous Batching（连续批处理）**：把同时到达的多个请求**拼成一批**一起喂给 GPU 算，而且谁先生成完谁先"下车"、空出的位置立刻让新请求"上车"，GPU 一刻不闲。这就是车队的"拼车 + 即时补位"。
- **PagedAttention（分页注意力）**：把每个请求占的显存（[KV Cache](./local-models)）像操作系统管内存那样**分页**管理，碎片浪费极小，于是同样显存能塞下更多并发请求。

> ⚠️ 你**不需要**理解这两个机制的算法细节。要记住的是结论：生产跑开源模型别用 Ollama 硬扛并发，换 vLLM 这类引擎，同一张卡能服务的用户数完全不是一个量级。

---

## 显存够不够：先做个粗估

能跑多大模型、能扛多少并发，主要看显存。两部分相加：

1. **模型权重**：≈ 参数量 × 每参数字节数。FP16 每参数 2 字节，4-bit 量化约 0.5 字节。
   - 例：7B 模型，FP16 ≈ 14GB，4-bit ≈ 4GB
2. **KV Cache**：每个并发请求、每个 token 都要占一份，**随并发数和上下文长度线性涨**。高并发 + 长上下文时，这部分可能比权重还大。

> ⚠️ 新手最容易忽略 KV Cache。"模型才 14GB，我 24GB 卡够了吧"——结果一上并发就 OOM（显存爆了），因为没给 KV Cache 留够空间。vLLM 启动时用 `--max-model-len`（单请求最大上下文）和显存占比参数来控制这块。

**量化部署**：和 [1.10 的量化](./local-models) 思路一样，但生产更看重推理速度——常用 **AWQ / GPTQ** 这类专为推理优化的量化格式，用一点点质量换更小显存 + 更高吞吐。

---

## 怎么起：一条命令，一个 OpenAI 兼容服务

vLLM 启动后直接对外提供 **OpenAI 兼容接口**——意味着你的业务代码完全不用改，和 [1.9](./openai-compatible) 是同一套协议，只是 baseURL 指向你自己的服务器。

```bash
# 需要一张 GPU（本地显卡或云 GPU）。安装后一条命令起服务：
pip install vllm
vllm serve Qwen/Qwen2.5-7B-Instruct --port 8000 --max-model-len 8192
# 它会在 http://localhost:8000/v1 暴露一个 OpenAI 兼容的 /chat/completions
```

业务侧还是熟悉的 OpenAI SDK，只改 baseURL：

```javascript
import OpenAI from "openai"

// 指向你自己部署的 vLLM 服务，apiKey 随便填（除非你自己加了鉴权）
const client = new OpenAI({ baseURL: "http://localhost:8000/v1", apiKey: "EMPTY" })

const res = await client.chat.completions.create({
  model: "Qwen/Qwen2.5-7B-Instruct",   // 和 serve 时的模型名一致
  messages: [{ role: "user", content: "用一句话解释什么是连续批处理" }],
})
console.log(res.choices[0].message.content)
```

---

## 到底要不要自托管？

⚠️ **大多数情况，直接用云 API（DeepSeek/百炼等）更划算**——别人帮你扛运维、扩容、升级。只有命中下面这些，自托管才值得：

| 该自托管 | 该用云 API |
|---|---|
| 数据合规要求高，绝不能出内网 | 一般业务，数据可走云 |
| 规模大到云 API 账单 > 自购/租 GPU 的成本 | 量不大或波动大 |
| 要跑自己**微调**的模型（[5.15](/ch5-deep-dives/finetuning-local)） | 通用模型够用 |
| 要极致控制延迟/版本，不接受厂商偷偷改模型 | 能接受托管的便利与约束 |

> 自托管的隐藏成本是**运维**：GPU 采购/租用、扩缩容、监控、故障恢复都得自己扛。把这些算进总成本再和云 API 比，常常会发现"省下的 token 钱"还不够付运维。

---

## 🛠️ 实战练习：起一个 vLLM 服务并感受并发吞吐

> 需要一张 GPU（没有本地显卡可租云 GPU，如各家 GPU 云的按量实例）。

**具体步骤：**
1. 按上面的命令 `vllm serve` 起一个 7B 模型服务
2. 用下面的脚本分别发 **1 路** 和 **20 路并发**请求，对比总耗时和"每秒完成请求数"

```javascript
import OpenAI from "openai"
const client = new OpenAI({ baseURL: "http://localhost:8000/v1", apiKey: "EMPTY" })

async function one() {
  const r = await client.chat.completions.create({
    model: "Qwen/Qwen2.5-7B-Instruct",
    messages: [{ role: "user", content: "讲个一句话冷笑话" }],
    max_tokens: 64,
  })
  return r.choices[0].message.content
}

async function bench(concurrency) {
  const start = Date.now()
  await Promise.all(Array.from({ length: concurrency }, one))   // 同时发 concurrency 个请求
  const sec = (Date.now() - start) / 1000
  console.log(`并发 ${concurrency}：总耗时 ${sec.toFixed(1)}s，吞吐 ${(concurrency / sec).toFixed(1)} req/s`)
}

await bench(1)
await bench(20)
```

**期望结果**：20 路并发的**总耗时远不到** 1 路的 20 倍——因为 vLLM 把这些请求连续批处理了，GPU 没闲着。这就是生产推理引擎相对"逐个串行"的价值。

**进阶挑战**：把同样的并发压测打到本地 Ollama 上对比，直观看到两者在并发下的吞吐差距；再观察并发拉到很高时延迟怎么变化（吞吐和单请求延迟是一对需要权衡的指标）。

---

## 📌 关键结论

1. Ollama 是给单人/调试的；生产扛并发要换 vLLM 这类推理引擎（同类有 SGLang、TGI）
2. 吞吐起飞靠两个机制：连续批处理（拼车 + 即时补位，GPU 不空转）和 PagedAttention（显存分页，少浪费）——知道结论即可，不用懂算法
3. 显存 = 模型权重 + KV Cache；**KV Cache 随并发和上下文涨**，最容易被忽略导致 OOM
4. vLLM 直接提供 OpenAI 兼容接口，业务代码不用改，只把 baseURL 指向自己的服务（同 1.9）
5. 多数情况云 API 更划算；只有数据合规、规模反转成本、要跑自微调模型、要极致控制时才自托管，且别忘了把运维成本算进去

---

第 1 章完成。下一步：[第 2 章 · 构建 AI 产品](/ch2-build-products/)
