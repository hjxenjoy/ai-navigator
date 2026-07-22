# 4.20 Pi 源码解剖（三）：工具系统

[4.17](./pi-harness) 讲了 Pi 的设计哲学，这一节开始钻进源码，先看 Agent 的"手"——工具系统（Tool System）。我们会回答四个问题：一个工具在代码里长什么样、四个内置工具各自怎么实现、工具定义怎么被翻译成各家模型 API 的格式、以及为什么默认只给四个。

本节所有引用都基于 Pi 源码 v0.81.1（monorepo，核心包在 `packages/` 下：`ai` = pi-ai、`agent` = pi-agent-core、`coding-agent` = pi-coding-agent），引用格式为 `packages/<pkg>/src/xxx.ts:行号`。行号会随版本漂移，但结构是稳定的。

## 一、工具怎么定义：两层类型，一个 TypeBox schema

### 是什么

一个"工具"对模型来说就是三样东西：**名字、一段自然语言描述、一份参数 schema**（JSON Schema 格式）。模型不"执行"任何代码，它只是输出"我想调用 `read`，参数是 `{path: "a.ts"}`"这样的结构化文本；真正干活的是 Harness 侧的 `execute` 函数。Pi 把这个分工直接写进了类型系统，分成两层：

- **pi-ai 层**（`Tool`）：只有要发给模型的那三样——这是"协议的另一半"看到的工具
- **pi-agent-core 层**（`AgentTool`）：在 `Tool` 之上加上 `execute` 等运行时能力——这是 Harness 手里的工具

### 怎么做：源码走读

pi-ai 的基础定义在 `packages/ai/src/types.ts:448`：

```ts
import type { TSchema } from "typebox";

export interface Tool<TParameters extends TSchema = TSchema> {
	name: string;
	description: string;
	parameters: TParameters;
}
```

逐行看：第一行 import 回答了一个关键问题——**Pi 的参数 schema 用的是 TypeBox，不是 zod**。TypeBox 的特点是"schema 本身就是 JSON Schema 对象"，同时能推导出 TypeScript 类型。`Tool` 接口只有三个字段：`name`、`description` 会原样进入系统提示或 API 请求体，`parameters` 是一个 TypeBox schema（泛型 `TParameters` 让 TypeScript 能静态检查 `execute` 的参数类型）。

pi-agent-core 把它扩展成可执行的工具，`packages/agent/src/types.ts:380`：

```ts
export interface AgentTool<TParameters extends TSchema = TSchema, TDetails = any> extends Tool<TParameters> {
	/** Human-readable label for UI display. */
	label: string;
	prepareArguments?: (args: unknown) => Static<TParameters>;
	execute: (
		toolCallId: string,
		params: Static<TParameters>,
		signal?: AbortSignal,
		onUpdate?: AgentToolUpdateCallback<TDetails>,
	) => Promise<AgentToolResult<TDetails>>;
	executionMode?: ToolExecutionMode;
}
```

（为节省版面省略了部分文档注释。）逐段看：

- `label`：给终端 UI 显示用的名字，和发给模型的 `name` 解耦
- `prepareArguments`：**参数校正钩子**——模型有时不按 schema 出牌（后面 edit 工具会看到一个真实案例），在执行前给它一次"洗参数"的机会
- `execute`：真正干活的函数。`Static<TParameters>` 是从 TypeBox schema 推导出的参数类型；`signal` 是 AbortSignal（用户按 Esc 取消就靠它）；`onUpdate` 允许工具在执行中流式汇报进度（bash 的滚动输出就靠它）
- `executionMode`：声明这个工具能不能和其他工具调用并行执行

模型返回的工具参数会先经过校验：`packages/ai/src/utils/validation.ts:278` 的 `validateToolArguments` 用 `Value.Convert`（TypeBox 的值转换）尝试把参数纠正成 schema 要求的类型（比如字符串 `"5"` 转成数字），纠正不了就用编译后的校验器 `Check`，失败则抛出带逐条错误信息的异常——这些错误会作为工具结果回喂给模型，让它自己改正。

> 💡 **类比**：这套设计像**餐厅的点菜单**。`Tool`（名字 + 描述 + 参数）是印给顾客看的菜单页——顾客（模型）只负责"点菜"；`AgentTool` 多出来的 `execute` 是后厨的做法，顾客永远看不到。菜单页用 JSON Schema 这种"通用格式"印刷，是因为顾客可能来自任何一家（Anthropic、OpenAI、Google……），而后厨做法是 TypeScript，只有自己人需要懂。

### 一个真实工具定义：read

看一眼最小的真实例子，`packages/coding-agent/src/core/tools/read.ts:20`：

```ts
const readSchema = Type.Object({
	path: Type.String({ description: "Path to the file to read (relative or absolute)" }),
	offset: Type.Optional(Type.Number({ description: "Line number to start reading from (1-indexed)" })),
	limit: Type.Optional(Type.Number({ description: "Maximum number of lines to read" })),
});
```

注意每个字段都带 `description`——**schema 里的描述文字是写给模型看的提示词，不是给人看的注释**。模型靠它判断"offset 从 1 开始数"。这就是为什么写工具定义本质上是写提示词，呼应 [4.8](./harness-engineering) 里"工具是 Harness 与模型之间的协议"。

## 二、四个内置工具的实现要点

Pi 默认内置 `read` / `bash` / `edit` / `write` 四个工具，全部在 `packages/coding-agent/src/core/tools/` 下。每个工具文件的结构都一样：顶部定义 schema，中间是可替换的 `Operations` 接口（默认走本地文件系统，可替换成 SSH 远程执行），底部是 `createXxxToolDefinition` 工厂函数。下面只挑每个工具最值得看的一段。

### read：截断不是砍掉，是给模型留"续读"的路标

read 的输出会被 `truncateHead` 截断，上限是 2000 行或 50KB（`packages/coding-agent/src/core/tools/truncate.ts:11-12`）。有意思的是截断之后的处理，`packages/coding-agent/src/core/tools/read.ts:295`：

```ts
} else if (truncation.truncated) {
	// Truncation occurred. Build an actionable continuation notice.
	const endLineDisplay = startLineDisplay + truncation.outputLines - 1;
	const nextOffset = endLineDisplay + 1;
	outputText = truncation.content;
	if (truncation.truncatedBy === "lines") {
		outputText += `\n\n[Showing lines ${startLineDisplay}-${endLineDisplay} of ${totalFileLines}. Use offset=${nextOffset} to continue.]`;
	} else {
		outputText += `\n\n[Showing lines ${startLineDisplay}-${endLineDisplay} of ${totalFileLines} (${formatSize(DEFAULT_MAX_BYTES)} limit). Use offset=${nextOffset} to continue.]`;
	}
	details = { truncation };
}
```

逐段看：截断发生时，Pi 不只是砍掉多余内容，而是在输出尾部**追加一行给模型看的提示**——"现在显示的是第 X 到 Y 行，共 Z 行，用 `offset=Y+1` 继续读"。模型看到这段文字，下一轮就知道该带什么参数回来接着读。

这是 [4.9](./context-engineering) 上下文工程的微观样本：**上下文是有限的，所以每次往上下文里放东西，都要顺手给模型留下"下一步怎么拿到更多"的信息**。截断提示也是提示词工程，只不过它写在工具的实现代码里。

### write：全量覆盖，并接受"整文件重写"这个事实

write 的 schema 只有两个字段（`packages/coding-agent/src/core/tools/write.ts:14`）：

```ts
const writeSchema = Type.Object({
	path: Type.String({ description: "Path to the file to write (relative or absolute)" }),
	content: Type.String({ description: "Content to write to the file" }),
});
```

默认实现就是 `fs.writeFile` 加 `mkdir -p`（`packages/coding-agent/src/core/tools/write.ts:32-35`），没有任何增量逻辑——**write 就是全量覆盖**。新建文件、整文件重写走 write；局部修改走 edit。两个工具的职责切分非常干净。

一个容易漏看的细节：edit 和 write 都包在 `withFileMutationQueue`（`packages/coding-agent/src/core/tools/file-mutation-queue.ts`）里——同一个文件的写操作会串行排队。因为 Pi 默认并行执行工具调用（`packages/agent/src/agent.ts:230`），没有这个队列，两个并发的 edit 可能互相覆盖。

### edit：整个工具系统里最值得读的代码

edit 的 schema 是一次调用携带**多个替换块**（`packages/coding-agent/src/core/tools/edit.ts:44`）：

```ts
const editSchema = Type.Object(
	{
		path: Type.String({ description: "Path to the file to edit (relative or absolute)" }),
		edits: Type.Array(replaceEditSchema, {
			description:
				"One or more targeted replacements. Each edit is matched against the original file, not incrementally. Do not include overlapping or nested edits. If two changes touch the same block or nearby lines, merge them into one edit instead.",
		}),
	},
	{},
);
```

每个替换块是 `{oldText, newText}`（精确文本替换）。`edits` 数组的 description 信息量很大，它直接告诉模型三条规则：每块对着**原始文件**匹配（不是链式应用）、块之间不许重叠、相近的改动合并成一块。**这就是"schema 即提示词"的极致——把模型的常见翻车方式预先写进参数描述里。**

执行主流程（`packages/coding-agent/src/core/tools/edit.ts:339`，节选）：

```ts
// Strip BOM before matching. The model will not include an invisible BOM in oldText.
const { bom, text: content } = stripBom(rawContent);
const originalEnding = detectLineEnding(content);
const normalizedContent = normalizeToLF(content);
const { baseContent, newContent } = applyEditsToNormalizedContent(normalizedContent, edits, path);
// ...
const finalContent = bom + restoreLineEndings(newContent, originalEnding);
await ops.writeFile(absolutePath, finalContent);
```

逐行看：先剥掉 BOM（模型不会在 `oldText` 里写不可见字符）→ 检测原文件的换行符风格（CRLF 还是 LF）→ 统一成 LF 做匹配 → 应用替换 → **恢复原来的换行符、贴回 BOM** 再写盘。一个 Windows 换行符的文件被 edit 之后不会悄悄变成 Unix 换行符——这种"不动无关字节"的克制，是生产级工具和玩具的分水岭。

匹配逻辑在 `fuzzyFindText`（`packages/coding-agent/src/core/tools/edit-diff.ts:206`，节选）：

```ts
export function fuzzyFindText(content: string, oldText: string): FuzzyMatchResult {
	// Try exact match first
	const exactIndex = content.indexOf(oldText);
	if (exactIndex !== -1) {
		return { found: true, index: exactIndex, matchLength: oldText.length,
			usedFuzzyMatch: false, contentForReplacement: content };
	}
	// Try fuzzy match - work entirely in normalized space
	const fuzzyContent = normalizeForFuzzyMatch(content);
	const fuzzyOldText = normalizeForFuzzyMatch(oldText);
	const fuzzyIndex = fuzzyContent.indexOf(fuzzyOldText);
	if (fuzzyIndex === -1) {
		return { found: false, /* ... */ };
	}
	return { found: true, index: fuzzyIndex, matchLength: fuzzyOldText.length,
		usedFuzzyMatch: true, contentForReplacement: fuzzyContent };
}
```

策略是**先精确匹配，失败再模糊匹配**：`normalizeForFuzzyMatch`（`edit-diff.ts:33`）会把行尾空白、智能引号（`""` → `"`）、各种 Unicode 破折号（`—` → `-`）、特殊空格统一规范化——因为模型从网页或文档里"学来"的代码经常带这些字符，精确匹配会莫名失败。命中后还要过两道检查（`edit-diff.ts:332-354`）：`oldText` 在文件里出现多次则报错"文本不唯一，请提供更多上下文"；多个替换块区间重叠则报错要求合并。**这些报错信息同样是写给模型看的**——它下一轮会带着更多上下文重试。

最后看 `prepareArguments` 的真实用途（`packages/coding-agent/src/core/tools/edit.ts:101`）：

```ts
// Some models (Opus 4.6, GLM-5.1) send edits as a JSON string instead of an array
if (typeof args.edits === "string") {
	try {
		const parsed = JSON.parse(args.edits);
		if (Array.isArray(parsed)) args.edits = parsed;
	} catch {}
}
```

注释点名了两个具体模型会把 `edits` 数组序列化成 JSON 字符串发过来。**Harness 要替模型的怪癖兜底**——这一行是"支持 15+ 提供商"的真实代价，你很少在设计文档里看到它，但它就躺在生产代码里。

### bash：超时杀整棵进程树，输出截断留全文文件

bash 的 schema 只有 command 和可选的 timeout（`packages/coding-agent/src/core/tools/bash.ts:40`）：

```ts
const bashSchema = Type.Object({
	command: Type.String({ description: "Bash command to execute" }),
	timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (optional, no default timeout)" })),
});
```

注意 description 明说**没有默认超时**——超不超时、多久超时，交给模型按任务性质判断（跑测试套件和 `ls` 不该共享一个默认值）。

超时和取消的处理（`packages/coding-agent/src/core/tools/bash.ts:117`，节选）：

```ts
// Set timeout if provided.
if (timeoutMs !== undefined) {
	timeoutHandle = setTimeout(() => {
		timedOut = true;
		if (child.pid) killProcessTree(child.pid);
	}, timeoutMs);
}
// Stream stdout and stderr.
child.stdout?.on("data", onData);
child.stderr?.on("data", onData);
```

两个要点：超时触发的是 `killProcessTree`——**杀整棵进程树**而不只是直接子进程，否则 `npm test` 这类会 fork 孙进程的命令根本杀不掉；stdout 和 stderr 合并进同一个数据流（两个流都接 `onData`），模型看到的是按时间交错的完整输出。

输出处理和 read 同构但更进一步（`bash.ts:301` 的工具描述）：截断到**最后** 2000 行或 50KB（命令输出通常尾部最有用，所以是 `truncateTail` 方向），而且**完整输出会写进一个临时文件**，截断提示里带上文件路径（`bash.ts:385-390`）——模型想看全文，可以用 read 或 bash 自己去读那个文件。这就是"外部记忆"手法的随手应用：上下文放不下的东西，落到磁盘上，把路径交给模型。

退出码非零时，bash 工具会把输出连同 `Command exited with code N` 一起作为错误抛出（`bash.ts:422-424`）——错误也带着完整输出回给模型，模型通常能看着报错自己修。

## 三、工具定义怎么进请求：providers 层的翻译

### 是什么

`Tool.parameters` 是 TypeBox schema，而 TypeBox schema 本身就是标准 JSON Schema——所以"序列化"这件事大部分是免费的。真正的差异在**各家 API 包装工具定义的壳子**不一样。这层翻译在 pi-ai 的 `packages/ai/src/api/` 目录，每个 API 家族一个文件。

### 怎么做：两个 convertTools 对照

Anthropic 的翻译函数（`packages/ai/src/api/anthropic-messages.ts:1269`，节选）：

```ts
return tools.map((tool, index) => {
	const schema = tool.parameters as { properties?: unknown; required?: string[] };

	return {
		name: isOAuthToken ? toClaudeCodeName(tool.name) : tool.name,
		description: tool.description,
		...(supportsEagerToolInputStreaming ? { eager_input_streaming: true } : {}),
		input_schema: {
			type: "object",
			properties: schema.properties ?? {},
			required: schema.required ?? [],
		},
		...(deferLoading ? { defer_loading: true } : {}),
		...(cacheControl && index === tools.length - 1 ? { cache_control: cacheControl } : {}),
	};
});
```

OpenAI 的（`packages/ai/src/api/openai-completions.ts:1164`）：

```ts
function convertTools(
	tools: Tool[],
	compat: ResolvedOpenAICompletionsCompat,
): OpenAI.Chat.Completions.ChatCompletionTool[] {
	return tools.map((tool) => ({
		type: "function",
		function: {
			name: tool.name,
			description: tool.description,
			parameters: tool.parameters as any, // TypeBox already generates JSON Schema
			...(compat.supportsStrictMode !== false && { strict: false }),
		},
	}));
}
```

对照着看，差异都在"壳"上：

- **壳的形状**：Anthropic 要 `{name, description, input_schema}`，OpenAI 要 `{type: "function", function: {name, description, parameters}}`——同一份工具定义，两种包装
- **schema 的处理**：OpenAI 版整份透传（注释直白地说"TypeBox 已经生成 JSON Schema"）；Anthropic 版只取 `properties` 和 `required` 两个字段重建 `input_schema`
- **缓存钩子**：Anthropic 版里 `cache_control` 只打在**最后一个工具**上——这是 Prompt Caching 的断点标记（呼应 [1.16](/ch1-llm-engineering/prompt-caching)），放在工具列表末尾意味着"工具定义这一整段前缀都可以缓存"
- **兼容性分支**：Anthropic 版有个细节——用 OAuth token（Claude 订阅账号）调用时，工具名要经过 `toClaudeCodeName` 改写成 Claude Code 风格的内置工具名（`anthropic-messages.ts:102`），因为该通道对工具名有白名单校验。这也是"多提供商"背后看不见的胶水

> ⚠️ **常见误解**："工具调用是模型厂商的特殊能力，换个模型就得重写工具。" 从这两个函数能看清楚：**工具定义只有一份**（`Tool` 接口），差异只是 providers 层几十行的格式翻译。你的自定义工具一次定义，15+ 个提供商都能用——真正绑死在厂商身上的只有这层薄壳。

## 四、取舍：为什么默认只有 4 个工具

先纠正一个流传的说法："Pi 没有 grep/find 这类辅助工具。"**源码里它们是存在的**——`packages/coding-agent/src/core/tools/` 下有 `grep.ts`、`find.ts`、`ls.ts`。区别在于默认启用哪些（`packages/coding-agent/src/core/tools/index.ts:168`）：

```ts
export function createCodingTools(cwd: string, options?: ToolsOptions): Tool[] {
	return [
		createReadTool(cwd, options?.read),
		createBashTool(cwd, options?.bash),
		createEditTool(cwd, options?.edit),
		createWriteTool(cwd, options?.write),
	];
}

export function createReadOnlyTools(cwd: string, options?: ToolsOptions): Tool[] {
	return [
		createReadTool(cwd, options?.read),
		createGrepTool(cwd, options?.grep),
		createFindTool(cwd, options?.find),
		createLsTool(cwd, options?.ls),
	];
}
```

默认编码会话走 `createCodingTools`：只有 read / bash / edit / write 四个（`packages/coding-agent/src/core/sdk.ts:65` 的注释也确认了这一点）。grep / find / ls 被打包成另一组**只读工具集**，SDK 用户可以按需选用（比如做代码审查 Agent 时只给只读工具，从机制上杜绝它改文件）。

为什么编码会话不给专用 grep？bash 工具的 `promptSnippet` 一句话道破（`bash.ts:302`）：`"Execute bash commands (ls, grep, find, etc.)"`——**bash 就是那个通用逃生舱**。模型本来就会用 shell，一个 bash 顶掉 grep/find/ls/wc/diff 无数个专用工具。

这个取舍的收益和代价都能从前面读过的代码里推出来：

- **收益一：协议面小**。每个工具都是上下文里的常驻开销（名字 + 描述 + schema 随每个请求发送）。4 个工具的 schema 加起来几十行，模型选错工具的概率也低
- **收益二：少一层要维护的翻译**。每个专用工具都要在 15+ 个提供商上行为一致——edit 那几行"模型怪癖兜底"代码提醒你，每多一个工具就多一处这种坑
- **代价**：bash 输出是没有结构的原始终端文本，模型要自己从 `grep` 输出里解析结果；而专用 grep 工具可以返回结构化的匹配列表。Pi 把这个代价留给了需要的人：SDK 暴露了 `createGrepTool` 等工厂（`sdk.ts:117-126`），想要自己加

> 💡 **类比**：默认四工具像瑞士军刀的**主刀 + 螺丝刀 + 剪刀 + 开瓶器**——覆盖 90% 场景，揣在兜里无感。grep/find/ls 是放在抽屉里的专用批头，干活场景明确（只读审查）才带上。真正的极简不是"没有"，而是"默认不带，伸手就够得着"。

## 🛠️ 实战练习：用 pi-agent-core 自定义一个最小工具

目标：不启动完整 CLI，只用 pi-agent-core 的 SDK 造一个自定义工具并跑通一轮"模型决定调用 → 工具执行 → 结果回喂"的闭环。

**准备**：

```bash
mkdir pi-tool-demo && cd pi-tool-demo
npm init -y
npm install @earendil-works/pi-agent-core @earendil-works/pi-ai
export ANTHROPIC_API_KEY=sk-ant-...   # 你的 Anthropic Key
# 或用 OpenAI：export OPENAI_API_KEY=sk-...，并把下面 getModel 换成
# getModel("openai", "gpt-4.1-mini")
```

API Key 的环境变量名由 pi-ai 约定（`packages/ai/src/env-api-keys.ts:71` 和 `:78`），`streamSimple` 会自动从环境变量读取（`packages/ai/src/compat.ts:222-227` 的 `withEnvApiKey`）。

**`dice-agent.mjs`**（完整可运行）：

```ts
import { Agent } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { getModel, streamSimple } from "@earendil-works/pi-ai/compat";

// 1. 定义工具：TypeBox schema + execute，和内置工具同一个接口
const diceTool = {
  name: "roll_dice",
  label: "roll dice",
  description: "Roll a die with the given number of sides and return the result.",
  parameters: Type.Object({
    sides: Type.Number({ description: "Number of sides on the die" }),
  }),
  async execute(_toolCallId, params) {
    const result = Math.floor(Math.random() * params.sides) + 1;
    return {
      content: [{ type: "text", text: `Rolled a ${params.sides}-sided die: ${result}` }],
      details: { result },
    };
  },
};

// 2. 组装 Agent：model + tools 放进初始状态
const model = getModel("anthropic", "claude-haiku-4-5");
if (!model) throw new Error("model not found in catalog");

const agent = new Agent({
  initialState: {
    systemPrompt: "You are a helpful assistant. Use tools when needed.",
    model,
    tools: [diceTool],
  },
  streamFn: streamSimple,
});

// 3. 订阅事件，观察工具调用过程
agent.subscribe((event) => {
  if (event.type === "tool_execution_start") {
    console.log(`[tool] ${event.toolName} called, args=`, event.args);
  }
  if (event.type === "tool_execution_end") {
    console.log(`[tool] finished, isError=${event.isError}`);
  }
});

// 4. 跑一轮，等 Agent 完全空闲
await agent.prompt("Roll a 20-sided die for me and tell me the result.");
await agent.waitForIdle();

// 5. 打印 Assistant 的最终文本回复
for (const m of agent.state.messages) {
  if (m.role !== "assistant") continue;
  for (const block of m.content) {
    if (block.type === "text") console.log("[assistant]", block.text);
  }
}
```

运行：`node dice-agent.mjs`（Node 20+，`.mjs` 后缀让顶层 `await` 可用）。

**期望结果**：控制台依次出现 `[tool] roll_dice called, args= { sides: 20 }`、`[tool] finished, isError=false`，最后 Assistant 用自然语言报出骰子结果。整个过程就是你本节读到的链路在运转：模型看到 `parameters` schema → 输出工具调用 → `validateToolArguments` 校验参数 → `execute` 执行 → 结果作为 tool result 回喂 → 模型生成最终回复。

**进阶挑战**：

1. 给工具加 `executionMode: "sequential"`，然后让模型"同时掷三个骰子"，观察事件顺序和默认并行模式的差别（对照 `packages/agent/src/agent.ts:230` 的默认值）
2. 故意把 schema 里的 `sides` 改成 `Type.Number()` 并在 `execute` 里打印 `typeof params.sides`，然后提示模型用字符串传参（比如"roll a 'twenty'-sided die"不管用就换个措辞诱导），观察 `Value.Convert` 的类型纠正是否在生效
3. 从 `@earendil-works/pi-coding-agent` import `createReadOnlyTools`，把这组只读工具加进 Agent，让它读你项目里的一个文件——体会 Pi 官方工具就是你这个 `diceTool` 的同构实现

## 📌 关键结论

1. Pi 的工具定义分两层：pi-ai 的 `Tool`（name + description + TypeBox schema，给模型看）和 pi-agent-core 的 `AgentTool`（加 `execute` 等运行时能力，给 Harness 用）；schema 用 TypeBox，不是 zod
2. 内置工具的实现细节本质都是上下文工程：read 截断后留"续读路标"、bash 截断后把全文落盘并交出路径、edit 的 schema 描述直接预演模型的翻车方式——工具的每一处输出都是写给模型的提示词
3. 工具定义序列化只有一层薄翻译：Anthropic 和 OpenAI 各一个几十行的 `convertTools`，schema 本体（JSON Schema）两家通吃——自定义工具一次定义、全提供商可用
4. 默认只启用 read / bash / edit / write 四个工具；grep / find / ls 在源码里存在，但打包成只读工具集供 SDK 按需取用——bash 是通用逃生舱，"默认不带，伸手够得着"
5. `prepareArguments`、换行符保留、进程树强杀这些"看不见的兜底"，是 Harness 替 15+ 提供商的模型怪癖付的真实成本，也是读生产级源码比读设计文档多出来的东西

---

下一节：[4.21 Pi 源码解剖（四）：消息系统与树状会话](./pi-source-session-tree)
