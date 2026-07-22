# 4.19 Pi 源码解剖（二）：Agent Loop

[4.17](./pi-harness) 讲过 Pi "刻意极简"的设计哲学，这一节开始下钻源码，看它的心脏——Agent Loop（Agent 主循环）——到底长什么样。

先给你三个数字垫底（在 v0.81.1 的源码树上用 `wc -l` 实测）：

- `packages/agent/src/agent-loop.ts`：**792 行**——主循环的全部实现
- `packages/agent/src/agent.ts`：**577 行**——对外的 `Agent` 类（状态 + 事件分发）
- 其中最核心的 `runLoop()` 函数（`agent-loop.ts:155-275`）：约 **120 行**

4.17 提过一个反差：Pi 极简，却在 TerminalBench 这类 Agent 基准上排名靠前。看完这 120 行你就明白了——**Agent Loop 这件事本身就不复杂，复杂的是别人往上堆的东西**。Pi 的底气在于：循环写得足够正确、足够干净，剩下的全交给模型。

> 本节所有引用格式为 `packages/<pkg>/src/xxx.ts:行号`，对应 Pi 仓库 v0.81.1，建议你打开源码对照着读。

---

## 是什么：一个循环，两个嵌套

先复习 [4.8](./harness-engineering) 的定义：Agent Loop 是 Harness 的第一个零件，负责"调模型 → 模型要调工具 → 执行工具 → 结果喂回模型 → 再调模型"，直到模型不再发起工具调用为止。

Pi 的实现把这个循环拆成了清晰的两层：

- **内层循环**：只要模型还在发起 tool call（工具调用），或者队列里还有用户插队消息，就一直转
- **外层循环**：内层停下来后，检查有没有"等 Agent 闲下来再发"的 follow-up（跟进）消息，有就接着转

对应源码里就是两个 `while`（`agent-loop.ts:170` 和 `:174`）。没有状态机、没有图、没有调度器——**两个 while 循环就是全部**。

> 💡 **类比**：Pi 的 Agent Loop 像餐厅的点餐动线：内层循环是"客人（模型）不停加菜（调工具），厨房（工具执行）就不断出菜（工具结果）端回去"；外层循环是"客人都说吃饱了，服务员问一句——刚才那位说等会儿要追加甜点的，现在上吗？"整个动线没有中央调度台，全靠一条朴素的规则：没人加菜就打烊。

---

## 怎么做：从 prompt() 到主循环的完整路径

### 入口：Agent.prompt()

`Agent` 类是对外的门面（facade）。你调 `prompt()` 时，它做的第一件事不是跑循环，而是**防止并发**（`agent.ts:339-347`）：

```typescript
async prompt(input: string | AgentMessage | AgentMessage[], images?: ImageContent[]): Promise<void> {
    if (this.activeRun) {
        throw new Error(
            "Agent is already processing a prompt. Use steer() or followUp() to queue messages, or wait for completion.",
        );
    }
    const messages = this.normalizePromptInput(input, images);
    await this.runPromptMessages(messages);
}
```

逐行看：

- 一个 Agent 实例同一时刻只允许一个活跃 run（`activeRun` 存在就直接抛错）。想插队？用 `steer()`（转向消息，下一轮前注入）或 `followUp()`（跟进消息，等 Agent 闲下来再处理）——这两个队列后面还会遇到
- `normalizePromptInput()` 把字符串、单条消息、消息数组三种输入统一成 `AgentMessage[]`
- 然后进入 `runPromptMessages()`

`runPromptMessages()`（`agent.ts:398-412`）只做组装：把当前状态快照成 `AgentContext`（systemPrompt + 消息 + 工具）、把各种配置和钩子打包成 `AgentLoopConfig`，然后调底层的 `runAgentLoop()`。也就是说——**`Agent` 类自己不写循环，循环在无状态的 `agent-loop.ts` 里**。这个"有状态的门面 + 无状态的引擎"分层，是 Pi 源码里最重要的结构决策。

### 主循环：runLoop() 的 120 行

`runAgentLoop()` 先做开场：把用户消息追加进上下文，发出 `agent_start`、`turn_start` 事件（`agent-loop.ts:109-116`），然后把控制权交给 `runLoop()`。下面是精简后的真实骨架（删掉钩子、队列等细节，保留主干的判断顺序）：

```typescript
// 精简自 packages/agent/src/agent-loop.ts:155-275
async function runLoop(currentContext, newMessages, config, signal, emit, streamFunction) {
    let firstTurn = true;
    let pendingMessages = (await config.getSteeringMessages?.()) || [];

    while (true) {                                    // 外层循环：follow-up 消息
        let hasMoreToolCalls = true;

        while (hasMoreToolCalls || pendingMessages.length > 0) {  // 内层循环
            if (!firstTurn) await emit({ type: "turn_start" });

            // 1. 把插队消息注入上下文
            for (const message of pendingMessages) { /* push 进 context 和 newMessages */ }
            pendingMessages = [];

            // 2. 流式调模型
            const message = await streamAssistantResponse(currentContext, config, signal, emit, streamFunction);
            newMessages.push(message);

            // 3. 出错或被中断 → 收尾退出
            if (message.stopReason === "error" || message.stopReason === "aborted") {
                await emit({ type: "turn_end", message, toolResults: [] });
                await emit({ type: "agent_end", messages: newMessages });
                return;
            }

            // 4. 收集 tool calls 并执行
            const toolCalls = message.content.filter((c) => c.type === "toolCall");
            hasMoreToolCalls = false;
            if (toolCalls.length > 0) {
                const executedToolBatch = await executeToolCalls(currentContext, message, config, signal, emit);
                hasMoreToolCalls = !executedToolBatch.terminate;
                for (const result of executedToolBatch.messages) {
                    currentContext.messages.push(result);   // 结果追加进消息
                    newMessages.push(result);
                }
            }

            await emit({ type: "turn_end", message, toolResults });
            pendingMessages = (await config.getSteeringMessages?.()) || [];
        }

        // 5. 内层停了，看看有没有 follow-up 消息
        const followUpMessages = (await config.getFollowUpMessages?.()) || [];
        if (followUpMessages.length > 0) { pendingMessages = followUpMessages; continue; }
        break;
    }

    await emit({ type: "agent_end", messages: newMessages });
}
```

对照注释走一遍这个循环的数据流：

1. **注入插队消息**：循环开头先排空 steering 队列——用户在 Agent 干活时输入的消息，会在这里进入上下文，而不是打断当前轮
2. **流式调模型**：`streamAssistantResponse()` 发起一次模型请求，边收边发事件（下一小节细看）
3. **失败即退出**：`stopReason` 是 `error` 或 `aborted` 就发收尾事件、直接 return——错误路径和正常路径共用同一套事件协议
4. **执行工具、追加结果**：从消息内容里筛出 `toolCall` 块，执行后把每个 `toolResult` **追加进 `currentContext.messages`**——这就是"把结果喂回模型"的字面实现，就是一次 `push`
5. **外层兜底**：模型不再调工具了，再查一次 follow-up 队列；有就塞进 `pendingMessages` 让内层继续，没有就 `break` 收场

画成流程图：

```
        prompt("...")
            │
            ▼
   ┌─────────────────┐   已在运行？抛错，提示用 steer()/followUp()
   │  Agent.prompt() │──────────────────────────────► throw
   └────────┬────────┘
            ▼
   runPromptMessages()        状态快照 + 配置组装
            │
            ▼
   runAgentLoop()             emit agent_start / turn_start
            │
            ▼
 ╔══════════ 外层 while（follow-up）══════════╗
 ║   ┌─────── 内层 while ───────┐            ║
 ║   │ 注入 pending 消息        │            ║
 ║   │          │               │            ║
 ║   │          ▼               │            ║
 ║   │ streamAssistantResponse  │ 边流式边发  ║
 ║   │   （调一次模型）          │ message_* 事件
 ║   │          │               │            ║
 ║   │   error / aborted? ──────┼──► agent_end，退出
 ║   │          │ no            │            ║
 ║   │          ▼               │            ║
 ║   │  有 toolCall?            │            ║
 ║   │    ├─ 有 → executeToolCalls           ║
 ║   │    │      结果 push 进 messages       ║
 ║   │    │      → 回到内层顶部（再调模型）   ║
 ║   │    └─ 无 → 出内层循环    │            ║
 ║   └──────────────────────────┘            ║
 ║   follow-up 队列非空？ ── 是 ──► 回内层    ║
 ╚══════════════╪════════════════════════════╝
                │ 否
                ▼
         emit agent_end
```

一个值得停留的细节：内层循环条件是 `hasMoreToolCalls || pendingMessages.length > 0`（`agent-loop.ts:174`）。**终止条件不是"模型说了结束语"，而是"模型这一轮没有发起任何 tool call，且队列空了"**。自然语言回复本身就是停止信号——模型选择不调工具，循环就停。这个设计和 4.8 讲的理论模型完全同构，只是 Pi 把它写得毫无修饰。

### stream() 在循环里怎么被消费

`streamAssistantResponse()`（`agent-loop.ts:281-372`）是循环与 pi-ai（统一模型层）的接缝。它做三件事：上下文变换（`transformContext` 钩子）→ 消息转换（`convertToLlm`，把内部消息格式转成 LLM 消息格式）→ 调 `streamFunction`。

最后一步是这样发起和消费的（`agent-loop.ts:308-317`）：

```typescript
const response = await streamFunction(config.model, llmContext, {
    ...config,
    apiKey: resolvedApiKey,
    signal,
});

let partialMessage: AssistantMessage | null = null;
let addedPartial = false;

for await (const event of response) {
```

- `streamFunction` 的类型是 `StreamFn`（`agent.ts` 里 `types.ts:28-32`），签名是 `(model, context, options) => AssistantMessageEventStream`。Pi 的 coding-agent 在启动时把 pi-ai 的 `streamSimple` 注册成默认实现（`packages/coding-agent/src/core/sdk.ts:36`）
- 返回值是一个 **AsyncIterable（异步可迭代对象）**，所以消费方式就是一句 `for await...of`——每来一个流式事件，循环体执行一次

流式事件的协议定义在 pi-ai（`packages/ai/src/types.ts:468-480`），共 12 种：`start` → 一串 `text_delta` / `thinking_delta` / `toolcall_delta` 等增量事件 → 以 `done` 或 `error` 收尾。`streamAssistantResponse` 的 switch 把它们翻译成 Agent 层事件：`start` 翻译成 `message_start`，各种 delta 翻译成 `message_update`，`done`/`error` 翻译成 `message_end`（`agent-loop.ts:317-361`）。

支撑这个 `for await` 的是 pi-ai 里的 `EventStream` 类（`packages/ai/src/utils/event-stream.ts:4-67`），它是一个手写的"异步队列"：生产者 `push(event)`，消费者用异步迭代器逐个取；队列空了就挂起等待，来了事件就唤醒。整个类 60 多行，没有依赖任何流库。

> ⚠️ **常见误解**："流式输出需要 WebSocket、SSE 或者什么高级的响应式框架。" 在 Agent 内部，流式只是**一个异步迭代器**：模型提供商那边怎么收 SSE 是 pi-ai 的事，Agent Loop 看到的就是 `for await` 里一个个普通事件对象。你给自己写 Agent 时，一层 `EventStream` 加一个 `for await` 就够了——这正是"极简"的实证。

---

## 状态怎么推给 UI：AgentEvent 订阅模式

循环内部发生的一切，都通过 `emit()` 变成事件流。事件的类型是一个 TypeScript 联合类型（union type）`AgentEvent`（`agent.ts` 里 `types.ts:422-437`），共 **10 种**，分四组：

| 分组 | 事件 | 含义 |
|-----|------|------|
| Agent 生命周期 | `agent_start` / `agent_end` | 一次 run 的开与收；`agent_end` 携带本次 run 产生的全部新消息 |
| 轮次（turn） | `turn_start` / `turn_end` | 一轮 = 一次模型响应 + 它引发的工具调用 |
| 消息 | `message_start` / `message_update` / `message_end` | `message_update` 只在流式期间发，携带最新的部分消息（partial message） |
| 工具执行 | `tool_execution_start` / `tool_execution_update` / `tool_execution_end` | 工具的开始、中间进度、最终结果 |

UI（TUI、RPC 客户端、你的 SDK 宿主）通过 `subscribe()` 挂监听（`agent.ts:243-246`）：

```typescript
subscribe(listener: (event: AgentEvent, signal: AbortSignal) => Promise<void> | void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
}
```

每个事件到达时，`Agent` 先更新自己的状态，再逐个 `await` 监听器（`agent.ts:529-575`）：

```typescript
private async processEvents(event: AgentEvent): Promise<void> {
    switch (event.type) {
        case "message_start":
            this._state.streamingMessage = event.message;
            break;
        // ... message_update / message_end / tool_execution_* / turn_end / agent_end
    }

    const signal = this.activeRun?.abortController.signal;
    if (!signal) {
        throw new Error("Agent listener invoked outside active run");
    }
    for (const listener of this.listeners) {
        await listener(event, signal);
    }
}
```

两个设计细节值得注意：

- **状态归约（reduce）在前，通知在后**：`switch` 先把事件折算进 `AgentState`——`message_end` 把消息 push 进 `state.messages`，`tool_execution_start/end` 维护 `pendingToolCalls` 这个 Set。UI 因此有两种消费方式：听事件做增量渲染，或者随时直接读 `agent.state` 拿当前快照
- **监听器是 `await` 的，且按订阅顺序串行**：慢的监听器会拖住循环。这是故意的——`agent_end` 的所有监听器结算完，Agent 才算真正闲下来（注释见 `agent.ts:240-242`），保证"Agent 已空闲"这个信号对写入会话文件这类收尾操作是可靠的

> 💡 **类比**：这套订阅模式像会议室里的速记员 + 公告板。速记员（`processEvents` 的 switch）把每句话实时整理到会议纪要（`AgentState`）里，公告板（事件流）同步推给每个旁听者（listener）。想随时进来的人翻会议纪要就能跟上，全程在场的人看公告板就够——两种姿势，一份真相。

这就是 4.17 说的"四种运行模式"能共用同一个引擎的原因：TUI 订阅事件渲染界面，Print 模式订阅事件逐行打印 JSON，RPC 模式订阅事件转发给远端进程——**Harness 对 UI 零假设，只承诺一份事件流**。

---

## 终止、错误与中断

### 正常终止

三条出路，前面都已露面：模型不再发起 tool call 且队列排空（主路径，`agent-loop.ts:271-274`）；`shouldStopAfterTurn` 钩子返回 true（`agent-loop.ts:247-257`，给"上下文快满了，优雅收工"这类场景留的口子）；以及工具结果带 `terminate` 标记——**一批工具结果全部**标了 `terminate: true` 时，`hasMoreToolCalls` 置 false，循环自然停（判定函数 `shouldTerminateToolBatch`，`agent-loop.ts:582-584`）。

### 错误处理：错误是消息，不是异常

Pi 的错误哲学集中体现在 `StreamFn` 的契约里（`agent.ts` 的 `types.ts:18-27` 注释）：流函数**不许抛异常**，一切失败必须编码成流里的 `error` 事件 + 一条 `stopReason` 为 `"error"` 的 AssistantMessage。

于是循环的错误处理变成了纯数据判断（`agent-loop.ts:196-200`）：看到 `stopReason === "error"` 就走正常收尾——发 `turn_end`、`agent_end`，退出。UI 看到的失败和成功是同一形状的事件序列，只是消息上多了 `errorMessage` 字段。

万一底层循环真的抛了异常（比如钩子函数违反契约），`Agent` 层有兜底（`agent.ts:496-512`）：合成一条假的失败 AssistantMessage，然后**补发完整的 `message_start` → `message_end` → `turn_end` → `agent_end` 四连事件**。这样无论内部怎么崩，UI 收到的永远是一个协议上完整、可以正常收尾的 run——不会出现"界面卡在 streaming 状态"的僵尸会话。

### 中断（abort）：一根 AbortSignal 走到底

中断用的是 Web 标准 API `AbortController`，没有任何自制机制：

- `Agent` 每次 run 创建一个 `AbortController`（`agent.ts:476`），`agent.abort()` 就是调它的 `.abort()`（`agent.ts:312-314`）
- 这根 `signal` 一路传进循环、传进模型请求（`agent-loop.ts:311`）、传进每个工具的 `execute()`（`agent-loop.ts:678`）
- 循环内的检查是"合作式"的：工具批次执行间查 `signal?.aborted`（如 `agent-loop.ts:478-480`），被中断的模型流会以 `stopReason: "aborted"` 收尾，走和 error 相同的退出路径

还有一个很容易被忽略的防御性设计：如果模型输出因为达到 token 上限被截断（`stopReason === "length"`），这条消息里的 tool call 参数可能是**被截断的 JSON**——Pi 选择**一个都不执行**，全部标记为错误结果让模型重发（`agent-loop.ts:208-216`，实现见 `failToolCallsFromTruncatedMessage`，`agent-loop.ts:381-406`）。这是用代码承认了"流式解析出的截断参数不可信"，宁可浪费一轮也不乱执行。

> ⚠️ **常见误解**："中断 Agent 就是 kill 掉请求或者把循环标志位置 false。" Pi 的做法是**让中断沿着既有的信号和事件通道流动**：`AbortSignal` 负责"传话"（模型层、工具层各自感知），事件协议负责"收尾"（`aborted` 也是一条正常消息）。所以被中断的会话依然是一份结构完整、可保存、可 `continue()` 的上下文——这正是 4.17 里树状会话能从任意节点继续的前提。

---

## 为什么这样设计：取舍分析

把上面的实现选择摆在一起，取舍就清楚了：

- **两个 while，不要状态机**：状态机让"处于哪个状态"显式化，但也让每种新情况（插队消息、follow-up、优雅停止）都要新增状态和迁移。while 循环把这些都退化成队列和布尔值，换来的是 120 行可通读的核心
- **事件协议统一成功与失败**：UI 只需实现一套渲染管线。代价是调用方必须检查 `stopReason` / `errorMessage`，不能靠 try-catch 区分成败
- **监听器串行 await**：保证收尾可靠（`agent_end` 结算完才算闲），代价是慢监听器拖慢循环——Pi 赌的是监听器本来就该快
- **AbortSignal 合作式中断**：不打断正在执行的工具（工具自己决定如何响应 signal），代价是 abort 不是"立即生效"——换来的是永远不会把文件系统、子进程留在半截状态
- **截断的 tool call 一律不执行**：牺牲一轮重试，排除"执行了参数残缺的危险操作"这一整类事故

这些取舍有同一个偏向：**正确性和可恢复性优先于花哨的控制结构**。这呼应了 [4.9](./context-engineering) 的一个观点——上下文才是 Agent 的核心资产。Pi 的循环本质上是一个"上下文维护器"：它所有的克制（错误编码成消息、中断走协议、失败补全事件序列），都是为了让 `messages` 数组在任何时刻都是一份干净、可序列化、可继续的真相。

---

## 🛠️ 实战练习：亲手驱动一次 Agent Loop

不需要装 Pi 本体，直接用它的两个 npm 包写个驱动脚本，亲眼看事件流。

1. **建实验目录**：`mkdir pi-loop-lab && cd pi-loop-lab && npm init -y`，然后 `npm i @earendil-works/pi-agent-core @earendil-works/pi-ai`（`Type` 由 pi-ai 转出口，无需单独装 typebox）
2. **写脚本** `loop.mjs`：

```javascript
import { Agent, setDefaultStreamFn } from "@earendil-works/pi-agent-core";
import { streamSimple, getModel } from "@earendil-works/pi-ai/compat";
import { Type } from "@earendil-works/pi-ai";

setDefaultStreamFn(streamSimple);  // 用 pi-ai 的统一流接口当引擎（与 sdk.ts:36 同款）

const weatherTool = {
  name: "get_weather",
  label: "查天气",
  description: "查询指定城市的天气",
  parameters: Type.Object({ city: Type.String() }),
  execute: async (id, { city }) => ({
    content: [{ type: "text", text: `${city}：晴，26°C` }],
    details: {},
  }),
};

const agent = new Agent({
  streamFn: streamSimple,
  initialState: {
    model: getModel("anthropic", "claude-sonnet-4-5"),  // 需要 ANTHROPIC_API_KEY 环境变量
    systemPrompt: "你是一个助手，查天气必须用工具。",
    tools: [weatherTool],
  },
});

agent.subscribe((event) => {
  if (event.type === "message_update") return;          // 增量事件太密，先忽略
  console.log(`[event] ${event.type}`,
    event.type.startsWith("tool_execution") ? event.toolName : "");
});

await agent.prompt("北京和上海天气怎么样？可以并行查。");
const last = agent.state.messages.at(-1);
console.log("最终回复：", last.content.map(c => c.text ?? "").join(""));
```

3. **跑起来**：`ANTHROPIC_API_KEY=你的key node loop.mjs`，观察事件打印顺序
4. **观察事件序**：你应该看到 `agent_start → turn_start → message_start → message_end → tool_execution_start ×2 → tool_execution_end ×2 → message_start/end ×2（toolResult 消息）→ turn_end → turn_start → … → agent_end`。数一数 `turn_start` 出现了几次——那就是模型被调用的轮数
5. **试中断**：在 `prompt()` 后加一行 `setTimeout(() => agent.abort(), 1500)`，再跑一次，观察 `agent_end` 里最后一条消息的 `stopReason`

**期望结果**：第 4 步看到两轮 `turn_start`（第一轮模型发起两个 tool call，第二轮模型基于结果给出自然语言回复并停止）；第 5 步看到 `stopReason: "aborted"`，且事件序列仍然完整收尾。

**进阶挑战**：给 `Agent` 传入 `afterToolCall` 钩子，让它在工具结果里附加 `terminate: true`（参考 `types.ts:79-90` 的合并语义），观察循环是否在工具执行完后直接停止、不再发起第二轮模型调用——亲手验证"工具可以终止循环"这条路径。

---

## 📌 关键结论

1. Pi 的 Agent Loop 核心只有约 120 行（`runLoop`，`agent-loop.ts:155-275`），结构是两个嵌套 `while`：内层转"模型↔工具"，外层兜 follow-up 消息——极简不是口号，是行数
2. 循环与模型的接缝是一个异步迭代器：`streamFn` 返回 `AssistantMessageEventStream`，`for await` 消费流式事件，翻译成 Agent 层的 `message_*` 事件
3. 状态通过 `AgentEvent` 联合类型（10 种事件）以订阅模式推给 UI：先归约进 `AgentState`，再按序 `await` 监听器——TUI、Print、RPC、SDK 四种模式共享同一份事件流
4. 错误和中断都是"数据"而非"异常"：失败编码成 `stopReason` 为 `error`/`aborted` 的消息，中断靠一根 `AbortSignal` 贯穿模型层与工具层，任何结局下事件序列都完整收尾
5. 这个循环的所有取舍都指向同一目标：让 `messages` 数组在任何时刻（出错、被中断、被截断）都是可序列化、可继续的真相——上下文才是 Agent 的核心资产

---

下一节：[4.20 Pi 源码解剖（三）：工具系统](./pi-source-tools)
