# 2.14 限流、重试与熔断

AI API 调用在生产里会遇到各种短暂失败：Rate Limit 被打到、模型服务过载、网络抖动。普通 HTTP 接口的重试逻辑搬来直接用是不够的——AI 请求有自己的特点：**慢（3-30 秒）、贵（每次都计费）、限额严（RPM/TPM 双维度限制）**。这一节把重试、限流、熔断三件事一起讲清楚。

---

## 错误分类：哪些要重试，哪些不要

不是所有错误都值得重试。盲目重试只会放大问题：

| HTTP 状态码 | 含义 | 是否重试 |
|-----------|------|---------|
| 400 | 参数错误（Prompt 格式错、模型名错） | ❌ 不重试，先修 Bug |
| 401 | API Key 无效 | ❌ 不重试，先修 Key |
| 403 | 权限不足 / 被封 | ❌ 不重试 |
| 422 | 输入内容被过滤 | ❌ 不重试，换输入 |
| 429 | Rate Limit（太频繁） | ✅ 重试，等待后 |
| 500 | 模型服务内部错误 | ✅ 重试（有时是临时的） |
| 503 | 模型过载 | ✅ 重试 |
| 504 | 网关超时 | ✅ 重试 |
| ECONNRESET / 网络错误 | 网络抖动 | ✅ 重试 |

---

## 退避策略：指数退避 + 抖动

普通重试：`等 1s → 等 1s → 等 1s` — 多个请求同时重试会把服务器继续打爆。

指数退避：`等 1s → 等 2s → 等 4s` — 给服务器恢复时间，但如果很多客户端同步重试，还是同时打到服务器。

**指数退避 + 抖动（Jitter）**：在退避时间上加随机量，让不同客户端错峰重试：

```javascript
function sleepWithJitter(attempt, baseMs = 1000, maxMs = 30_000) {
  // 指数退避基础时间
  const exp = Math.min(baseMs * Math.pow(2, attempt), maxMs)
  // 加 0-50% 随机抖动，避免"惊群效应"
  const jitter = exp * 0.5 * Math.random()
  return new Promise(r => setTimeout(r, exp + jitter))
}

async function callAIWithRetry(params, { maxRetries = 3, timeout = 90_000 } = {}) {
  const RETRYABLE = new Set([429, 500, 502, 503, 504])

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)

    try {
      const res = await client.chat.completions.create(params, {
        signal: controller.signal
      })
      return res

    } catch (err) {
      clearTimeout(timer)

      const status = err?.status ?? err?.response?.status
      const isRetryable = RETRYABLE.has(status) || err.name === 'AbortError' || err.code === 'ECONNRESET'

      if (!isRetryable || attempt === maxRetries) {
        throw err
      }

      // 429 时厂商通常在响应头里告诉你等多久
      const retryAfter = parseInt(err?.headers?.['retry-after'] ?? '0', 10)
      if (retryAfter > 0) {
        await new Promise(r => setTimeout(r, retryAfter * 1000))
      } else {
        await sleepWithJitter(attempt)
      }

    } finally {
      clearTimeout(timer)
    }
  }
}
```

---

## 两种限额：RPM 和 TPM

AI API 通常有两个维度的限额：

| 限额 | 含义 | 触发 429 的典型场景 |
|-----|------|----------------|
| **RPM**（每分钟请求数） | 1 分钟内最多发多少个请求 | 短时间内发了太多并发请求 |
| **TPM**（每分钟 Token 数） | 1 分钟内最多消耗多少 Token | 单次请求 Token 量很大，或 Token 总量超额 |

> ⚠️ RPM 和 TPM **同时生效**。你可能 RPM 没超但 TPM 超了（比如每个请求都是超长 Prompt），也可能 Token 少但请求太多。两个都要考虑。

### 应对 TPM 限额：队列 + 令牌桶

如果你有大量并发请求，简单重试不够——需要在客户端做**流量控制**，让请求按速率排队发出：

```javascript
// 简单的"令牌桶"速率控制器
class TokenBucketLimiter {
  constructor({ rpm = 60, tpmBudget = 100_000 } = {}) {
    this.minIntervalMs = 60_000 / rpm  // 两次请求之间的最小间隔
    this.lastSentAt = 0
    this.queue = []
    this.running = false
  }

  // 排队等候发送
  async enqueue(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject })
      this._drain()
    })
  }

  async _drain() {
    if (this.running || this.queue.length === 0) return
    this.running = true

    while (this.queue.length > 0) {
      const now = Date.now()
      const wait = this.lastSentAt + this.minIntervalMs - now
      if (wait > 0) await new Promise(r => setTimeout(r, wait))

      const { fn, resolve, reject } = this.queue.shift()
      this.lastSentAt = Date.now()
      try { resolve(await fn()) } catch (e) { reject(e) }
    }

    this.running = false
  }
}

// 使用
const limiter = new TokenBucketLimiter({ rpm: 50 })
const results = await Promise.all(
  docs.map(doc => limiter.enqueue(() =>
    callAIWithRetry({ model: MODEL, messages: [{ role: "user", content: doc }] })
  ))
)
```

---

## 熔断器（Circuit Breaker）

重试 + 限速可以应对临时抖动。但如果 AI 服务持续故障（比如整个机房下线），你的系统不应该无限发请求——每次调用都超时，会把调用方的资源也耗尽。

**熔断器**：记录最近 N 次调用的失败率。失败率超过阈值，暂时"断开电路"，后续请求直接返回降级结果而不发出去，过一段时间再探测服务是否恢复。

```
状态机：
  CLOSED（正常）→ 连续失败超阈值 → OPEN（断路，拒绝请求）
  OPEN → 等待恢复时间 → HALF-OPEN（探测）→ 成功 → CLOSED
                                             → 失败 → OPEN
```

```javascript
class CircuitBreaker {
  constructor({ threshold = 5, timeout = 60_000 } = {}) {
    this.threshold = threshold   // 连续失败多少次开始断路
    this.timeout = timeout       // 断路后多少 ms 探测恢复
    this.failures = 0
    this.state = 'CLOSED'        // CLOSED | OPEN | HALF_OPEN
    this.nextAttempt = 0
  }

  async call(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('AI 服务暂时不可用，请稍后重试')  // 降级提示给用户
      }
      this.state = 'HALF_OPEN'
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (err) {
      this.onFailure()
      throw err
    }
  }

  onSuccess() {
    this.failures = 0
    this.state = 'CLOSED'
  }

  onFailure() {
    this.failures++
    if (this.failures >= this.threshold) {
      this.state = 'OPEN'
      this.nextAttempt = Date.now() + this.timeout
    }
  }
}

const breaker = new CircuitBreaker({ threshold: 5, timeout: 30_000 })
// 实际使用
const res = await breaker.call(() => callAIWithRetry({ model: MODEL, messages }))
```

---

## 降级策略

断路器触发时，不要让用户看到空白或报错。提前想好降级方案：

| 功能 | 降级方案 |
|-----|---------|
| AI 问答 | 展示"AI 暂时繁忙，请稍后重试"+ 提供人工客服入口 |
| AI 搜索增强 | 降级为关键词搜索（不调 AI）|
| AI 摘要 | 降级为截断原文前 300 字 |
| AI 分类 | 降级为规则分类（置信度标注为"自动"）|
| AI 生成 | 禁用"生成"按钮，显示提示 |

```javascript
async function askWithFallback(question) {
  try {
    return await breaker.call(() => callAIWithRetry({ model: MODEL, messages: [...] }))
  } catch (err) {
    // 记录降级事件，方便监控
    logMetric('ai_fallback', { reason: err.message, question })
    return { content: 'AI 当前繁忙，请稍后重试。如需紧急帮助，请联系人工客服。', fallback: true }
  }
}
```

> 💡 降级不代表失败。用户看到"暂时不可用"比看到 500 报错或永久 loading 好得多。设计降级路径是生产 AI 产品的必修课。

---

## 批量任务的节奏控制

不是所有 AI 调用都是实时的。批量处理（标注、分类、摘要一批文档）时，节奏控制更重要：

```javascript
// 批量处理：控制并发数 + 记录进度
async function processBatch(items, { concurrency = 5, delayMs = 200 } = {}) {
  const results = []
  
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency)
    const chunkResults = await Promise.allSettled(
      chunk.map(item => limiter.enqueue(() => callAIWithRetry({ model: MODEL, messages: buildMessages(item) })))
    )
    results.push(...chunkResults)
    
    // 每批之间稍作停顿，减少打 Rate Limit 的概率
    if (i + concurrency < items.length) {
      await new Promise(r => setTimeout(r, delayMs))
    }
    
    console.log(`进度：${Math.min(i + concurrency, items.length)} / ${items.length}`)
  }
  
  return results
}
```

---

## 📌 关键结论

1. 重试前先分清错误类型：400/401/422 不要重试，429/500/503/504 重试
2. 指数退避 + 随机抖动，避免多客户端同步打爆服务器
3. AI API 有 RPM 和 TPM 双维度限额，大批量时要用队列做客户端侧流量控制
4. 熔断器防止服务持续故障时无限消耗调用方资源，触发时切换到降级路径
5. 批量任务用控制并发数 + 分批间隔，而不是无限并发

---

下一节：[2.15 Guardrails 输出防护实战](./guardrails)
