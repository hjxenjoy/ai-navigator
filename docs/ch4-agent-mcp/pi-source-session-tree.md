# 4.21 Pi 源码解剖（四）：消息系统与树状会话

[4.17](./pi-harness) 从设计哲学讲了 Pi 的树状会话"为什么有价值"，这一节打开源码看它"怎么实现"——消息在内存里长什么样、落盘是什么格式、`/tree` 跳转时到底动了哪个指针。所有引用基于 `pi-mono` v0.81.1，行号以该版本为准。

前面几节解剖过 Pi 的整体分层和 Agent 循环，这一节聚焦它们之间的"数据底座"：循环里流转的每一条消息、你敲下的每一次回退，最终都落在 `pi-ai` 的类型定义和 coding-agent 的 `SessionManager` 这两个文件里。看完你会得到两样可迁移的东西：一份"多提供商消息类型该怎么设计"的参考实现，和一份"用纯文本日志实现树状历史"的参考实现——后者不到两百行核心代码，简单到可以抄。

## 消息系统：三种 role，一切皆为块

### 是什么

Pi 的消息类型定义在最底层的 `pi-ai` 包里。整个系统只有**三种**发给 LLM 的消息角色，用一个联合类型（union type）表达——`packages/ai/src/types.ts:423`：

```typescript
export interface UserMessage {
	role: "user";
	content: string | (TextContent | ImageContent)[];
	timestamp: number; // Unix timestamp in milliseconds
}

export interface AssistantMessage {
	role: "assistant";
	content: (TextContent | ThinkingContent | ToolCall)[];
	api: Api;
	provider: ProviderId;
	model: string;
	usage: Usage;
	stopReason: StopReason;
	errorMessage?: string;
	timestamp: number; // 省略 responseId、diagnostics 等字段
}

export interface ToolResultMessage<TDetails = any> {
	role: "toolResult";
	toolCallId: string;
	toolName: string;
	content: (TextContent | ImageContent)[];
	isError: boolean;
	timestamp: number; // 省略 details、usage 等字段
}

export type Message = UserMessage | AssistantMessage | ToolResultMessage;
```

（`packages/ai/src/types.ts:384-423`，字段有缩编）

逐段看：

- **`UserMessage`**：最简单，`content` 可以是纯字符串，也可以是文本块和图片块的数组。注意它**没有** thinking、没有工具调用——用户消息就是输入。
- **`AssistantMessage`**：信息密度最高。`content` 是一个**块数组**，三种块可以任意混排：文本、思考、工具调用。它还自带 `api` / `provider` / `model` 三个字段——因为 Pi 支持会话中随时 `/model` 切换，每条 assistant 消息必须自己记住"我是哪个模型说的"，否则回放历史时无法还原。`usage` 记录 token 消耗，`stopReason` 记录这一轮是正常结束（`stop`）、被工具调用打断（`toolUse`）还是出错。
- **`ToolResultMessage`**：工具的执行结果。关键字段是 `toolCallId`——它和 assistant 消息里某个工具调用块的 `id` 配对，模型靠这个 ID 知道"这个结果对应我刚才发起的哪次调用"。`isError` 区分成功与失败，失败结果也会照常发给模型，让它自己处理错误。

### 思考块与工具调用块：内联而非外挂

值得单独看的是这两个块的定义——`packages/ai/src/types.ts:335-357`：

```typescript
export interface ThinkingContent {
	type: "thinking";
	thinking: string;
	thinkingSignature?: string; // e.g., for OpenAI responses, the reasoning item ID
	/** 被安全过滤器打码时，加密载荷存在 signature 里以便回传 */
	redacted?: boolean;
}

export interface ToolCall {
	type: "toolCall";
	id: string;
	name: string;
	arguments: Record<string, any>;
	thoughtSignature?: string; // Google-specific: opaque signature for reusing thought context
}
```

两个设计细节：

- **`thinkingSignature` / `thoughtSignature`**：Anthropic 和 Google 要求多轮对话时把思考块的"签名"原样回传（用于防篡改和续接推理上下文）。Pi 没有为每个提供商各搞一套字段，而是在统一类型上留了可选的签名位——**提供商特有的东西被压成了不透明字符串，内联在通用结构里**。
- **工具调用是消息内容的一部分，不是消息的附属**。`ToolCall` 就躺在 assistant 消息的 `content` 数组里，和文本块、思考块平级。这忠实反映了 Anthropic Messages API 的数据模型：模型的一轮输出本来就是"一段文字 + 一次工具调用 + 再来一段文字"的混合流。

还有一个贯穿三种消息的取向：**错误也是数据，不是控制流**。assistant 消息出错时不是抛异常就完事，而是落盘成一条 `stopReason: "error"`、带 `errorMessage` 的正常消息（`packages/ai/src/types.ts:400-401`）；工具执行失败则是 `isError: true` 的 `ToolResultMessage`（`types.ts:419`），照样发给模型。失败因此成为会话树上一个可查看、可分叉、可回放的普通节点——你可以从一次报错之前的位置 `/tree` 跳回去换条路，而报错那条分支作为记录完整保留。

> 💡 **类比**：`AssistantMessage.content` 像**一盘录像带的磁轨**——思考、解说词（文本）、动作指令（工具调用）按时间顺序录在同一条带子上，播放（发给 LLM）时原样回放。如果改成"文本一条消息、工具调用一条消息"的外挂式结构，就得额外维护它们的交错顺序，而顺序恰恰是模型理解自己当时意图的关键。

### 块是怎么到达的：流式事件协议

块数组是"最终形态"，但模型是流式输出的，块是一块一块拼出来的。`pi-ai` 用一套事件协议描述这个过程（`packages/ai/src/types.ts:468-480`）：

```typescript
export type AssistantMessageEvent =
	| { type: "start"; partial: AssistantMessage }
	| { type: "text_start"; contentIndex: number; partial: AssistantMessage }
	| { type: "text_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
	| { type: "text_end"; contentIndex: number; content: string; partial: AssistantMessage }
	| { type: "thinking_start"; contentIndex: number; partial: AssistantMessage }
	| { type: "thinking_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
	| { type: "toolcall_start"; contentIndex: number; partial: AssistantMessage }
	| { type: "toolcall_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
	| { type: "toolcall_end"; contentIndex: number; toolCall: ToolCall; partial: AssistantMessage }
	| { type: "done"; reason: Extract<StopReason, "stop" | "length" | "toolUse">; message: AssistantMessage }
	| { type: "error"; reason: Extract<StopReason, "aborted" | "error">; error: AssistantMessage };
```

（`packages/ai/src/types.ts:468-480`，有缩编）

每种块都有 `start` / `delta` / `end` 三个生命周期事件，`contentIndex` 标明这个块在 `content` 数组里的位置——所以"模型先想了一段、又说了一句、然后发起工具调用"会被精确重建成 `[thinking, text, toolCall]` 的顺序。每个事件还携带当前的 `partial` 半成品消息，UI 层不用自己拼增量，直接渲染 `partial` 就行。注意工具调用的 `delta` 是**字符串**而不是结构化参数——模型流式输出的是 JSON 文本片段，`toolcall_end` 时才 parse 成完整的 `arguments` 对象。这也意味着半个 JSON 永远不会进入消息历史：落盘的只有 `end` 之后的完整块。

### AgentMessage：给应用层留的扩展缝

`Message` 只有三种 role，但 coding-agent 还需要存"bash 执行记录""压缩摘要"这类不该原样发给模型的东西。Pi 的解法是 `pi-agent-core` 里的一个可扩展联合类型——`packages/agent/src/types.ts:319`：

```typescript
export type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages];
```

`CustomAgentMessages` 默认是空接口（`packages/agent/src/types.ts:310`），靠 TypeScript 的**声明合并**（declaration merging）由上层包填充。coding-agent 在 `packages/coding-agent/src/core/messages.ts:70-77` 里注入了四种自定义消息：`bashExecution`（`!` 命令的执行记录）、`custom`（扩展注入的消息）、`branchSummary`、`compactionSummary`。

用声明合并而不是普通泛型，为的是**不改 `pi-agent-core` 一行代码就能扩充类型**——上层包甚至第三方扩展各自声明自己的消息类型，编译器把它们合并进同一个联合类型，类型安全全程不丢。这又是 Primitives 哲学：核心包只给"可扩展的消息联合"这个零件，不给任何具体消息。

这些消息怎么进 LLM 上下文？答案是**不进——先翻译**。`convertToLlm()`（`packages/coding-agent/src/core/messages.ts:148-194`）在每次调用 LLM 前把 `AgentMessage[]` 转成 `Message[]`：bash 执行记录被格式化成一段 user 文本，分支摘要和压缩摘要各自套上固定前后缀变成 user 消息，三种标准 role 原样透传。也就是说，**存储层的消息类型比协议层丰富，二者之间有一道显式的转换关卡**——这正是 [4.9](./context-engineering) "上下文是组装出来的"在类型系统里的样子。

## 会话持久化：一个 JSONL 文件就是一棵树

### 存在哪、什么格式

会话存储由 coding-agent 的 `SessionManager` 类负责（`packages/coding-agent/src/core/session-manager.ts:855`）。事实清单：

- **目录**：`~/.pi/agent/sessions/--<编码后的 cwd>--/`，按项目目录分桶。路径编码逻辑在 `session-manager.ts:476-481`——把 cwd 里的 `/`、`\`、`:` 全换成 `-`，两头再加 `--`；`getSessionsDir()` 在 `packages/coding-agent/src/config.ts:559-561`
- **文件名**：`<时间戳>_<sessionId>.jsonl`（`session-manager.ts:953`），sessionId 是 uuidv7（`session-manager.ts:208-210`，时间有序，所以文件名天然按创建时间排序）
- **格式**：JSONL——每行一个 JSON 对象，第一行是 session 头，之后每行一个条目。**单文件**：一个会话的所有分支都在同一个文件里
- **写入方式**：**append-only**（只追加）。正常路径就是一行 `appendFileSync`（`session-manager.ts:1021` 和 `1040`），从不修改已有行
- **读取方**：`/export` 的 HTML 导出器（`packages/coding-agent/src/core/export-html/index.ts:296-300`）也是通过 `SessionManager.open()` 读同一个文件、拿同一份条目流再渲染成自包含网页——会话文件是唯一事实来源，不存在第二份派生存储

一个容易忽略的工程细节：新会话**不会立刻建文件**。`_persist()` 里有个守卫（`session-manager.ts:1018-1027`）——在第一条 assistant 消息出现之前，条目只留在内存里；模型第一次回复落盘时才用 `wx` 标志（排他创建）一次性写入全部缓存条目。好处是"打开了又关掉、或开场就报错"的会话不会在磁盘上留下空壳文件。

### 格式也会进化：版本迁移留下的考古层

session 头里的 `version` 字段不是摆设。当前版本是 3（`CURRENT_SESSION_VERSION`，`session-manager.ts:30`），打开旧文件时会原地迁移（`migrateToCurrentVersion`，`session-manager.ts:281-291`）。迁移记录本身就是一段设计史：

- **v1 → v2**（`migrateV1ToV2`，`session-manager.ts:231-257`）：给每个条目**补发** `id` 和 `parentId`——旧格式是纯粹的线性日志，迁移时按文件顺序把 `parentId` 依次串成一条链。这个函数的存在直接证明了：**树状会话是后来才加的，而它能平滑升级，恰恰因为树的全部信息就是每行多两个字段**，老数据按顺序补指针即可，一行都不用删
- **v2 → v3**（`migrateV2ToV3`，`session-manager.ts:260-275`）：把 `hookMessage` 这个 role 改名为 `custom`——上一节说的扩展消息类型，在格式史上也改过名

迁移后整文件重写一次（`_rewriteFile`，`session-manager.ts:979-989`），这是 append-only 规则的唯一例外：只发生在格式升级和 fork 写新文件时，正常运行路径永不触碰旧行。

### 树怎么表示：每条目一对 id / parentId

JSONL 是线性的，树是二维的，怎么装下？答案是**不存树，存指针**。所有条目的公共基类（`session-manager.ts:46-51`）：

```typescript
export interface SessionEntryBase {
	type: string;
	id: string;
	parentId: string | null;
	timestamp: string;
}

export interface SessionMessageEntry extends SessionEntryBase {
	type: "message";
	message: AgentMessage;
}
```

每个条目有唯一 `id`（8 位十六进制短码，从 `randomUUID()` 截取并做碰撞检查，`session-manager.ts:221-228`）和一个指向父亲的 `parentId`，根条目为 `null`。条目类型不止消息——`SessionEntry` 联合类型（`session-manager.ts:144-153`）还包括 `thinking_level_change`、`model_change`、`compaction`、`branch_summary`、`label`（书签）、`session_info`（会话名）、`custom` 等。也就是说**会话里发生的一切状态变更都是树上的节点**，不只是对话。

这个"一切皆条目"有一个连锁好处：连元数据都复用同一套机制。比如书签——`label` 条目自己不挂内容，只用 `targetId` 指向想标记的条目（`session-manager.ts:111-115`）；取消书签就是再追加一条 `label: undefined` 的条目（`appendLabelChange`，`session-manager.ts:1232-1253`）。因为文件是 append-only 的，"删除标签"和"打标签"在磁盘上都是追加一行，读取时后写的覆盖先写的。**不可变日志 + 后者覆盖前者**，是这套存储从头到尾的一致性原则。

一个真实会话文件（缩编脱敏，字段与接口一一对应）长这样：

```json
{"type":"session","version":3,"id":"01933f4a-7c2b-...","timestamp":"2026-07-20T09:12:03.441Z","cwd":"/home/th/demo"}
{"type":"message","id":"a1b2c3d4","parentId":null,"timestamp":"2026-07-20T09:12:05.012Z","message":{"role":"user","content":"给 CLI 加 --verbose","timestamp":1753000000000}}
{"type":"message","id":"e5f6a7b8","parentId":"a1b2c3d4","timestamp":"2026-07-20T09:12:09.330Z","message":{"role":"assistant","content":[{"type":"thinking","thinking":"先看 cli.ts 的参数解析"},{"type":"toolCall","id":"toolu_01","name":"read","arguments":{"path":"src/cli.ts"}}],"api":"anthropic-messages","provider":"anthropic","model":"claude-sonnet-4-5","usage":{"input":4120,"output":183,"cacheRead":0,"cacheWrite":0,"totalTokens":4303,"cost":{...}},"stopReason":"toolUse","timestamp":1753000004000}}
{"type":"message","id":"c9d0e1f2","parentId":"e5f6a7b8","timestamp":"2026-07-20T09:12:09.890Z","message":{"role":"toolResult","toolCallId":"toolu_01","toolName":"read","content":[{"type":"text","text":"import { parseArgs } ..."}],"isError":false,"timestamp":1753000004800}}
{"type":"message","id":"11223344","parentId":"c9d0e1f2","timestamp":"2026-07-20T09:15:01.100Z","message":{"role":"user","content":"用方案 A 实现","timestamp":1753000100000}}
{"type":"message","id":"55667788","parentId":"c9d0e1f2","timestamp":"2026-07-20T09:22:44.500Z","message":{"role":"user","content":"回到刚才那里，换方案 B","timestamp":1753000560000}}
```

逐字段解释：

- **第 1 行，session 头**：`type: "session"` 标记这是一个 Pi 会话文件；`version: 3` 是格式版本（`CURRENT_SESSION_VERSION`，`session-manager.ts:30`，旧文件打开时自动迁移，比如 v1→v2 就是给线性历史补 `id`/`parentId`，`session-manager.ts:230-257`）；`id` 是会话 ID；`cwd` 记录会话在哪个目录启动；还有可选的 `parentSession`——如果这个文件是从别的会话 fork 出来的，指向源文件路径。
- **第 2 行，根消息**：`parentId: null`，树的根。注意外层是"条目"（entry），真正的消息体嵌在 `message` 字段里——**条目负责树结构，消息负责对话内容，两层职责分开**。
- **第 3 行，assistant 消息**：`content` 数组里思考块和工具调用块内联混排，正是上一节的结构落盘后的样子；`stopReason: "toolUse"` 说明这轮是被工具调用打断的。
- **第 4 行，工具结果**：`toolCallId: "toolu_01"` 与上一行的工具调用块配对。
- **第 5、6 行，分叉现场**：两条 user 消息的 `parentId` **都是 `c9d0e1f2`**——同一个父亲，两个儿子，树在这里分叉。这就是你用 `/tree` 跳回去换方案时，文件里真实发生的事情：**没有人改旧数据，只是新追加的一行把父亲指回了历史节点**。

> ⚠️ **常见误解**："切换分支时，Pi 把旧分支的消息从上下文/文件里删掉了。" 没有。文件是 append-only 的，任何条目都不会被修改或删除（`getEntries()` 的注释明说了这一点，`session-manager.ts:1296-1300`）。"切换"只是移动一个内存里的指针；旧分支安安静静躺在文件里，随时可以跳回去。你看到的"干净的上下文"是**读取时按指针重新走查出来的**，不是删除出来的。

## /tree 分叉在代码上怎么发生

### 切分支 = 移动 leaf 指针

`SessionManager` 内部维护一个 `leafId`——当前叶子指针。切分支的全部操作（`session-manager.ts:1360-1365`）：

```typescript
branch(branchFromId: string): void {
	if (!this.byId.has(branchFromId)) {
		throw new Error(`Entry ${branchFromId} not found`);
	}
	this.leafId = branchFromId;
}
```

就三行：校验目标存在，移动指针。**没有复制，没有删除，没有文件写入**。类的文档注释把这个模型说得很清楚（`session-manager.ts:844-854`）：追加即在当前叶子下创建子节点，分叉即把叶子移到更早的条目。

### 跳转之后，新消息怎么接进树

追加消息时，新条目的父亲就是当前叶子（`session-manager.ts:1057-1067`）：

```typescript
appendMessage(message: Message | CustomMessage | BashExecutionMessage): string {
	const entry: SessionMessageEntry = {
		type: "message",
		id: generateId(this.byId),
		parentId: this.leafId,
		timestamp: new Date().toISOString(),
		message,
	};
	this._appendEntry(entry);
	return entry.id;
}
```

`_appendEntry()` 顺手把 `leafId` 推进到新条目（`session-manager.ts:1044-1049`）。所以"跳到历史节点 → 说一句话"的完整链条是：`branch(旧节点)` 移动指针 → `appendMessage` 以旧节点为父追加新行 → 文件里多出一个分叉点。旧分支的子节点一个字符都没动过。

### 上下文是"从叶子走回根"走出来的

发给 LLM 的消息列表不是文件顺序，而是沿 parent 指针从当前叶子回溯到根（`buildSessionPath`，`session-manager.ts:352-360`）：

```typescript
const path: SessionEntry[] = [];
let current: SessionEntry | undefined = leaf;
while (current) {
	path.push(current);
	current = current.parentId ? index.get(current.parentId) : undefined;
}
path.reverse();
return path;
```

`buildSessionContext()`（`session-manager.ts:461-470`）在这条路径上再处理 compaction（压缩点之前的条目被摘要替换）和条目→消息的转换。**同一棵树上，选不同的叶子，就走出不同的线性历史**——树是存储，路径才是上下文。

### /tree 的完整链路

交互模式里 `/tree` 打开树形选择器（`packages/coding-agent/src/modes/interactive/interactive-mode.ts:2701-2702`），数据来自 `getTree()`——把扁平的条目数组按 parentId 组装成嵌套树（`session-manager.ts:1310-1348`，孤儿条目兜底当根）。选中节点后走 `navigateTree()`（`packages/coding-agent/src/core/agent-session.ts:2889`），里面有一个值得玩味的分支判断（`agent-session.ts:3012-3023`）：

```typescript
if (targetEntry.type === "message" && targetEntry.message.role === "user") {
	// User message: leaf = parent (null if root), text goes to editor
	newLeafId = targetEntry.parentId;
	editorText = contentText(targetEntry.message.content, "");
} else if (targetEntry.type === "custom_message") {
	// Custom message: leaf = parent (null if root), text goes to editor
	newLeafId = targetEntry.parentId;
	editorText = contentText(targetEntry.content, "");
} else {
	// Non-user message: leaf = selected node
	newLeafId = targetId;
}
```

跳到**user 消息**和跳到别的节点，语义不同：选中 user 消息（或扩展注入的 custom 消息）时，叶子移到它的**父亲**，并把这条消息的原文塞回输入框——等于"回到我说这句话之前，让我重新说"。旧的那句不会被删，你的新说法会成为它的兄弟分支。这正是"探索-回退"在交互上的落地：不是撤销，而是重试。

跳转后还有一步不可省：重建 agent 状态（`agent-session.ts:3057-3058`）——`buildSessionContext()` 走出新路径，整份替换 `agent.state.messages`。另外用户可以选择给被放弃的分支生成摘要（`branchWithSummary`，`session-manager.ts:1381-1405`）：摘要作为 `branch_summary` 条目追加在新位置上，之后经 `convertToLlm()` 变成一条 user 消息进上下文——**被放弃分支的经验被压缩带进了新分支**，这是树结构之上的一个聪明补丁。

### 分叉出文件：/fork 与 parentSession

`/tree` 的分叉发生在**同一个文件内**，还有第二种分叉：`/fork`（`slash-commands.ts:31`）把某条路径**抽出来变成一个新会话文件**。`createBranchedSession()`（`session-manager.ts:1412-1512`）做的事：走出根到指定叶子的路径，申请一个新 sessionId，写一个新 JSONL 文件——头的 `parentSession` 字段指回源文件路径（`session-manager.ts:1441`），正文只含这条路径上的条目。从此两个文件各自独立演化，但通过 `parentSession` 保留着血缘。

文件内分叉和文件间 fork 的分工很直白：探索性的来回留在单文件里（树枝），值得单独立项的支线抽成新文件（树苗移栽）。两种分叉共用同一套 `parentId` 走查逻辑，区别只在存储边界。

## 取舍：为什么用树而不是线性日志

4.17 已经从价值角度论证过"探索-回退是常态"，这里只看实现层的账。

**树在这个存储模型下几乎是免费的。** 线性 JSONL 日志要支持"回退后重写"，只有两条路：截断文件（丢历史）或追加一个"回退标记"（读取逻辑复杂化，且语义上还是丢了）。而 `parentId` 方案里，文件本身**永远是线性追加的**——写入路径和最简单的日志一模一样，一次 `appendFileSync` 完事，崩溃恢复、并发追加、`tail -f` 查看全部成立。树的全部复杂性被推迟到了**读取时**：建一个 `id → 条目` 的索引（`_buildIndex`，`session-manager.ts:958-977`），然后从叶子走回根。写简单、读多一步，对"写频繁、整树重建只在启动和跳转时"的会话场景，这笔交换很划算。

**为什么不用数据库？** 一个几百 KB 的 JSONL 文件，`grep` 能查、`jq` 能分析、git 能 diff、坏了能手改——这正是 [4.8](./harness-engineering) 说的"状态与记忆"零件的极简实现：状态就是文件，调试工具就是你已经会用的那些。代价也实在：每次加载要全量解析（`loadEntriesFromFile` 自己实现了带缓冲的逐行读取，`session-manager.ts:514-556`），`getChildren` 是全表扫描（`session-manager.ts:1210-1218`），会话巨大时会变慢——但对"单个会话"这个量级，远没到有感的程度。

**为什么不是 DAG（有向无环图）？** 如果允许一个节点有多个父亲（比如"合并两条分支"），指针模型就要从单 `parentId` 变成数组，路径走查从回溯变成图搜索，compaction 的"第一个保留条目"语义也会含糊。Pi 用 `branch_summary` 摘要在**数据层面**模拟了合并的效果，而保持结构层面是单纯的树——又是同一个哲学：不给成品，给一个刚够用的零件。配合 [4.9](./context-engineering) 的视角看：线性日志里"回退"只能靠删（破坏性的），树里"隔离"是指针选择（非破坏性的）——**隔离手法能在时间轴上成立，前提就是存储模型允许同一段历史有多个"未来"**。

**为什么所有分支挤在一个文件里？** 反过来想"每个分支一个文件"会怎样：分叉点之前的公共历史要么复制（浪费且失去单点事实），要么跨文件引用（完整性立刻变脆，删一个文件就毁掉一串）。单文件让公共前缀**物理上只存一份**，`parentId` 引用永远不会悬空到文件外，而且整棵树可以用一次顺序读取加载。这也是 `/export` 能直接产出自包含 HTML 的原因——数据本来就是自包含的。

## 🛠️ 实战练习：解剖自己的会话文件

1. **找到文件**：用 Pi 随便聊两轮（至少让它调一次工具），然后 `ls ~/.pi/agent/sessions/`，进入对应当前项目编码目录，找到最新的 `.jsonl` 文件
2. **验证格式**：执行 `head -1 <文件> | jq .` 看 session 头（`version`、`cwd`），再 `wc -l <文件>` 数条目数——确认"一行一个条目"
3. **还原树**：执行 `cat <文件> | jq -r 'select(.type=="message") | "\(.id) <- \(.parentId) \(.message.role)"'`，把每个条目的父子关系打出来，手工画出这棵树
4. **制造分叉**：回到 Pi，用 `/tree` 跳到第一轮之前，说一句不同的话；退出后重新执行第 3 步，找到那个"一个 parentId 出现两次"的分叉点，确认旧分支的条目一个都没少
5. **走出上下文**：对着分叉后的文件，手工从最新叶子的 `id` 出发沿 `parentId` 回溯到 `null`，列出这条路径上的消息——这就是 `buildSessionContext()` 发给模型的东西
6. **观察 fork**：在 Pi 里对某个历史 user 消息执行 `/fork`，然后对比新旧两个文件的 session 头——新文件头的 `parentSession` 应该指向旧文件路径，且新文件只含分叉路径上的条目

**期望结果**：第 4 步之后，你能在文件里精确定位分叉点（某个 `id` 同时是两个条目的 `parentId`），并验证 append-only——旧分支消息的行号和内容在跳转前后完全一致。第 5 步之后，"树是存储、路径是上下文"对你来说不再是一句口号，而是你亲手走查过的一个循环。第 6 步之后，你能说清 `/tree` 和 `/fork` 在存储层面的分界线：前者动指针、后者写新文件。

**进阶挑战**：写一个 20 行的 Node.js 脚本，读取会话文件，实现 `buildSessionPath` 的等价逻辑（建 `byId` 索引 → 从叶子回溯 → 反转），再把路径上的消息按 `convertToLlm()` 的规则打印成 LLM 视角的消息序列。然后对照 `session-manager.ts:334-360` 检查你的实现漏了什么（提示：compaction）。

## 📌 关键结论

1. Pi 发给 LLM 的消息只有三种 role（user / assistant / toolResult），assistant 消息是**块数组**——文本、思考、工具调用按序内联，提供商特有信息被压成可选的签名字段
2. 会话持久化是 `~/.pi/agent/sessions/` 下的**单文件 JSONL**：append-only、一行一个条目、所有分支共存一个文件，新会话直到第一条 assistant 回复才落盘
3. 树结构不靠树形存储，靠每条目的 `id` / `parentId` 指针；`/tree` 切分支就是移动内存里的 `leafId`，新消息以当前叶子为父追加——**写入永远线性，分叉免费**
4. 上下文不是文件顺序，而是从叶子沿 parent 指针回溯到根走出的路径；跳到 user 消息时叶子移到其父节点、原文进输入框，实现"重新说"而非"撤销"
5. 这套设计的取舍清晰可算：写入路径保持日志级简单（崩溃安全、可手改、可 grep），复杂性推迟到读取时的索引和走查——对会话量级，这是正确的交换

---

下一节：[4.22 Pi 源码解剖（五）：扩展系统与热重载](./pi-source-extensions)
