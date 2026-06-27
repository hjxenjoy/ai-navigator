# 2.6 生产环境的坑

把 AI 功能从 demo 推到生产，会遇到一些特有的问题。

## 坑一：没有错误处理

AI API 会报错。网络超时、Rate Limit、模型过载，都会发生。

```javascript
// ❌ 没有错误处理
const response = await client.messages.create({ ... })

// ✅ 基本错误处理
async function callAI(params, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await client.messages.create(params)
    } catch (error) {
      if (error.status === 429 || error.status === 529) {
        // Rate limit 或服务过载，等待后重试
        await sleep(Math.pow(2, i) * 1000)
      } else if (error.status === 400) {
        throw error  // 参数错误，不重试
      } else if (i === maxRetries - 1) {
        throw error  // 最后一次重试失败
      }
    }
  }
}
```

## 坑二：Latency（延迟）没有预期

AI 响应比普通 API 慢得多，可能 3-30 秒。如果你的系统默认 API 超时是 5 秒，AI 请求会一直超时。

检查点：
- 设置合理的超时时间（AI 请求至少 60-120 秒）
- 用流式输出改善用户感知
- 超时后要有降级方案（提示用户稍后重试，而不是白屏）

## 坑三：费用超出预期

AI API 费用可以增长很快，特别是：
- System Prompt 太长 × 请求量大
- 让 AI 处理大量文档
- Agent 在循环里重复调用工具

建议：
- 设置每日费用告警
- 记录每个请求的 Token 消耗
- 对不同用户/功能设置 Token 配额

## 坑四：Prompt 在某些输入下崩溃

你的 Prompt 测了 20 个例子都没问题，但用户输入了一个奇怪的内容，AI 的输出格式完全不对，导致 JSON.parse 崩溃。

建议：
- 对 AI 输出做健壮的解析（try-catch + fallback）
- 建立输入过滤（过长的输入、特殊字符）
- 记录所有让 AI 输出异常的输入，作为测试案例

## 坑五：模型版本更新导致行为变化

模型版本更新后，同样的 Prompt 输出可能有变化。有时候是变好了，有时候是你依赖的某个特定行为不再出现。

建议：
- 在代码里明确固定模型版本（如 `claude-sonnet-4-6` 而不是 `claude-latest`）
- 升级模型版本前，跑一遍评估集对比

## 坑六：没有日志

出了问题你不知道 AI 当时收到了什么、输出了什么。

最基本的日志：
```javascript
async function callAIWithLog(params) {
  const startTime = Date.now()
  const response = await client.messages.create(params)
  
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    model: params.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    latencyMs: Date.now() - startTime,
    stopReason: response.stop_reason
  }))
  
  return response
}
```

---

## 📌 关键结论

1. 做好重试逻辑，AI API 报错是正常的
2. AI 延迟和普通 API 不同，超时设置要调整
3. 明确固定模型版本，模型升级要主动测试
4. 日志是出问题时唯一的线索，从第一天就要记

---

第 2 章完成。下一步：[第 3 章 · 理解引擎盖下面](/ch3-under-the-hood/)
