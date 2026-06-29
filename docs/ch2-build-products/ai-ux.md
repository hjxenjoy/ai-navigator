# 2.12 AI 产品的 UX 设计模式

AI 功能的用户体验和普通功能有本质区别：**响应时间以秒计、结果每次不完全一样、偶尔会答错或拒绝**。这些特性要求你专门为 AI 设计交互模式，而不是套用"点击→等待→显示"的老套路。

---

## 流式输出的 UX 心理学

把流式输出接入产品时，工程师往往只关心"能不能用"，忽略了它最重要的价值——**改变用户感知**。

```
实验数据（来自多个 A/B 测试）：
  - 流式版：用户感知等待时间平均减少 40-60%
  - 非流式版：即使总用时更短，用户也觉得"更慢"

原因：大脑对"有进展"的容忍度远高于"没有进展"。
```

> 💡 **类比**：电梯里装镜子不让电梯变快，但投诉等待时间的人减少了 60%。流式输出是 AI 交互里的"镜子"。

**实现最小流式 UX 的三要素：**

```javascript
// 要素一：立刻显示"光标"，告诉用户"我开始思考了"
function ChatMessage({ isStreaming, content }) {
  return (
    <div className="message">
      {content}
      {isStreaming && <span className="cursor blink">▋</span>}
    </div>
  )
}

// 要素二：第一个 token 到达前显示"loading"态（区分"联网中"和"生成中"）
function StreamStatus({ phase }) {
  if (phase === 'connecting') return <span>连接中…</span>
  if (phase === 'streaming') return null  // 已经在出字了，不需要
  return null
}

// 要素三：出错时明确提示（不要让用户盯着光标傻等）
function handleError(err) {
  setPhase('error')
  setErrorMsg('生成失败，点击重试')
}
```

---

## 加载状态的层次

AI 场景下的等待比普通 HTTP 请求复杂得多，需要有层次的状态管理：

```
第 0 层：用户刚发送  →  立刻显示"发送中"或禁用输入框（避免重复发送）
第 1 层：等待首字节  →  显示 skeleton（骨架屏）或动态省略号，时限 2-3 秒
第 2 层：流式输出中  →  逐字显示内容，可以取消
第 3 层：完成        →  关闭光标/loading 图标，显示完整内容
第 4 层：出错        →  显示错误原因 + 重试按钮
```

```javascript
// 状态机（比 boolean 组合更清晰）
const [phase, setPhase] = useState('idle')
// 'idle' | 'sending' | 'waiting' | 'streaming' | 'done' | 'error'

// 超时兜底：等了 10 秒还没开始出字，提示用户
useEffect(() => {
  if (phase !== 'waiting') return
  const timer = setTimeout(() => {
    setPhase('error')
    setErrorMsg('响应超时，请重试')
  }, 10_000)
  return () => clearTimeout(timer)
}, [phase])
```

---

## 可取消操作

用户可能在 AI 回到一半时发现它走偏了。**必须提供取消按钮。**

```javascript
const abortControllerRef = useRef(null)

async function sendMessage(text) {
  abortControllerRef.current = new AbortController()
  setPhase('streaming')

  try {
    const stream = await client.chat.completions.create({
      model: MODEL, messages: [...], stream: true,
    }, { signal: abortControllerRef.current.signal })  // 传入 signal

    for await (const chunk of stream) {
      if (abortControllerRef.current.signal.aborted) break
      appendContent(chunk.choices[0]?.delta?.content ?? '')
    }
    setPhase('done')
  } catch (err) {
    if (err.name === 'AbortError') setPhase('cancelled')
    else setPhase('error')
  }
}

function handleCancel() {
  abortControllerRef.current?.abort()
}
```

> ⚠️ 取消按钮要在**第一个 token 到达之前**就显示，不要等开始出字才出现——用户在"waiting"阶段就可能想取消。

---

## 错误 UX：不要让用户懵

AI 出错的类型和普通接口不同，错误信息要对用户有意义：

| 实际错误 | ❌ 别这样显示 | ✅ 这样更好 |
|---------|------------|-----------|
| 网络超时 | "Request failed with status 504" | "网络超时，请检查连接后重试" |
| 内容被过滤 | "content_policy_violation" | "这个问题我没法回答，换个方式试试？" |
| Rate limit | "429 Too Many Requests" | "请求太频繁，稍等几秒再试" |
| 模型错误 | "model_overloaded" | "AI 服务繁忙，请稍后重试" |
| 上下文超长 | "context_length_exceeded" | "对话太长了，建议开启新对话" |

```javascript
function friendlyError(err) {
  const code = err?.error?.code || err?.status
  const map = {
    504: '网络超时，请稍后重试',
    429: '请求太频繁，请等 10 秒再试',
    content_filter: '这个话题我没法回答，换一种方式试试？',
    context_length_exceeded: '对话太长了，可以开启新对话',
  }
  return map[code] ?? '出了点问题，请刷新后重试'
}
```

---

## 人工确认点（Human-in-the-Loop）

Agent 执行高风险操作前，用户需要看到"它要做什么"并确认。**这是 AI 产品里最容易被忽略的 UX 环节。**

```
好的确认 UX 应该：
  ✓ 用自然语言而非技术参数解释意图（"即将发送邮件给 3 人" 而非 "SMTP POST /send"）
  ✓ 显示"预览"（邮件内容、要删除的文件列表）
  ✓ 提供"编辑"入口，不只是"同意/拒绝"
  ✓ 说明后果的可逆性（"删除后无法恢复" vs "可以随时撤销"）
  ✓ 高风险操作加一步确认（"输入'确认'继续"）
```

> ⚠️ 不要把所有操作都加确认弹窗——**频繁的低风险确认会让用户养成无脑点"同意"的习惯**，反而削弱真正高风险时的警觉。只对"删除/发送/支付/权限变更"这类不可逆操作加。

---

## 渐进式披露（Progressive Disclosure）

AI 的思考过程和工具调用细节，普通用户不在乎，但工程师和高级用户想看。用分层展示：

```
默认层（所有用户看到）：
  → 干净的最终回答

可展开层（点击查看）：
  → "参考了 3 篇文档"  →  展开显示文档来源和片段
  → "调用了 2 个工具"  →  展开显示具体调用和结果

调试层（开发模式）：
  → 完整的 System Prompt
  → 每次 API 调用的 request / response
  → token 用量和成本
```

```javascript
// 来源引用的折叠展示
function AnswerWithSources({ answer, sources }) {
  const [showSources, setShowSources] = useState(false)
  return (
    <div>
      <p>{answer}</p>
      {sources?.length > 0 && (
        <button onClick={() => setShowSources(!showSources)}>
          📎 参考了 {sources.length} 个来源
        </button>
      )}
      {showSources && (
        <ul>
          {sources.map(s => <li key={s.id}><a href={s.url}>{s.title}</a></li>)}
        </ul>
      )}
    </div>
  )
}
```

---

## 置信度与不确定性 UX

AI 对某些问题没把握，但它经常表现得像很有把握。产品层面可以主动暴露不确定性：

- **来源标注**：RAG 场景标注"根据《xxx》第 2 章"，无来源说"这是我的判断，请核实"
- **低置信度提示**：对模型给出的数字、日期、专有名词，加"请自行核实"
- **边界明示**：在产品里明确写"这个 AI 只了解 XXX 领域，其他问题可能不准"
- **允许说"不知道"**：System Prompt 里明确允许，避免模型为了"帮用户"而编答案

> 💡 最好的 UX 不是让用户感觉 AI 无所不知，而是让用户**清楚知道哪些回答可以信赖、哪些需要验证**。

---

## 什么时候"隐藏" AI

不是所有 AI 功能都要告诉用户"这是 AI 做的"。有时候最好的 AI UX 是**无感的**：

| 场景 | 是否暴露"AI"身份 | 原因 |
|-----|--------------|------|
| 对话助手、问答机器人 | ✅ 明确告知 | 用户知道在和 AI 说话，不会有隐瞒感 |
| 搜索结果优化 / 排序 | ❌ 可以不说 | 用户只关心结果好不好 |
| 语法纠错、自动补全 | ❌ 不用说 | 是工具，用户关注结果不关注来源 |
| 内容审核 / 安全检测 | ❌ 不用说 | 后台流程，用户看不到 |
| 关键决策辅助（贷款/医疗） | ✅ 必须告知 + 有人工复核 | 法规要求 + 责任归属 |

---

## 🛠️ 实战练习：给你的 AI 功能做 UX 审查

拿你现在做的或想做的一个 AI 功能，对照这个清单逐项检查：

- [ ] 发送后是否立刻有视觉反馈（≤ 200ms）？
- [ ] 是否区分了"连接中"和"生成中"两个阶段？
- [ ] 流式输出有没有"取消"按钮？
- [ ] 报错信息是用户能看懂的语言（不是 HTTP 状态码）？
- [ ] 高风险操作有没有预览 + 确认界面？
- [ ] 是否暴露了来源或不确定性提示？

**期望结果**：找到至少 2 处可以改进的 UX 点，并用上面的代码片段修复。

---

## 📌 关键结论

1. 流式输出的最大价值是改变用户对速度的感知，而不仅仅是技术实现
2. 加载状态要有层次：idle → waiting → streaming → done/error，缺一不可
3. 取消按钮要在首字节之前就出现，不要等开始出字才显示
4. 错误信息翻译成用户语言；用状态码给用户看是 UX 的懒政
5. 人工确认点只加在真正高风险（不可逆）的操作上，否则会被养成无脑点击习惯
6. 渐进式披露：普通用户看干净结果，高级用户可展开看来源和工具调用

---

下一节：[2.13 语义缓存](./semantic-cache)
