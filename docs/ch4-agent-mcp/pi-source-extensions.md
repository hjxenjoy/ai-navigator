# 4.22 Pi 源码解剖（五）：扩展系统与热重载

[4.17](./pi-harness) 的解剖一说，Pi 可以让你"说改就改，`/reload` 当场生效"。这句话在代码上到底怎么成立？答案藏在 `packages/coding-agent/src/core/extensions/` 目录的三个文件里：`loader.ts`（发现与加载）、`runner.ts`（事件分发与生命周期）、`types.ts`（API 类型定义）。这一节逐个拆开看。

> 以下所有行号对应 Pi 源码 v0.81.1（npm 包 `@earendil-works/pi-coding-agent`）。

## 一个扩展到底是什么

先看最小事实：**一个扩展就是一个 TypeScript 文件，默认导出一个函数**。这是仓库自带的最小示例 `packages/coding-agent/examples/extensions/hello.ts` 的完整代码：

```typescript
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const helloTool = defineTool({
	name: "hello",
	label: "Hello",
	description: "A simple greeting tool",
	parameters: Type.Object({
		name: Type.String({ description: "Name to greet" }),
	}),

	async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
		return {
			content: [{ type: "text", text: `Hello, ${params.name}!` }],
			details: { greeted: params.name },
		};
	},
});

export default function (pi: ExtensionAPI) {
	pi.registerTool(helloTool);
}
```

逐段读：

- `defineTool({...})` 定义一个工具：`name` 是模型看到的工具名，`parameters` 用 TypeBox（一个 JSON Schema 库）描述参数结构，`execute` 是真正执行的函数，返回文本内容给模型
- `export default function (pi: ExtensionAPI)` 是扩展的**入口**。Pi 加载这个文件后，拿到这个默认导出函数，把一个名叫 `pi` 的 API 对象传进去调用一次
- 函数体内只有一件事：`pi.registerTool(helloTool)` ——把工具**登记**上去

这个函数的类型签名在 `packages/coding-agent/src/core/extensions/types.ts:1482`：

```typescript
export type ExtensionFactory = (pi: ExtensionAPI) => void | Promise<void>;
```

> 💡 **类比**：扩展的入口函数像**填报名表，而不是上台演出**。`factory(pi)` 执行的那一刻，你的代码几乎不"做事"——它只是往 Pi 的表格里登记："我有一个工具""我关心 tool_call 事件""我提供一个 /plan 命令"。登记完函数就返回了。真正干活是在之后：Agent 循环跑到某个节点，Pi 翻看登记表，发现你登记过，才回调你的 handler。理解"注册时"和"运行时"的分离，是理解整个扩展系统的钥匙。

---

## 发现：Pi 从哪些地方找扩展

入口函数是 `discoverAndLoadExtensions`，在 `packages/coding-agent/src/core/extensions/loader.ts:673`。它按顺序从三个来源收集扩展路径（loader.ts:694-718）：

```typescript
// 1. Project-local extensions: cwd/${CONFIG_DIR_NAME}/extensions/
const localExtDir = path.join(resolvedCwd, CONFIG_DIR_NAME, "extensions");
addPaths(discoverExtensionsInDir(localExtDir));

// 2. Global extensions: agentDir/extensions/
const globalExtDir = path.join(resolvedAgentDir, "extensions");
addPaths(discoverExtensionsInDir(globalExtDir));

// 3. Explicitly configured paths
for (const p of configuredPaths) {
	const resolved = resolvePath(p, resolvedCwd, { normalizeUnicodeSpaces: true });
	if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
		// Check for package.json with pi manifest or index.ts
		const entries = resolveExtensionEntries(resolved);
		if (entries) {
			addPaths(entries);
			continue;
		}
		// No explicit entries - discover individual files in directory
		addPaths(discoverExtensionsInDir(resolved));
		continue;
	}

	addPaths([resolved]);
}
```

三个来源分别是：

1. **项目级**：当前目录下的 `.pi/extensions/`。`CONFIG_DIR_NAME` 默认值就是 `".pi"`（`packages/coding-agent/src/config.ts:491`）
2. **全局级**：`~/.pi/agent/extensions/`。`getAgentDir()` 返回 `~/.pi/agent`，可被环境变量 `PI_CODING_AGENT_DIR` 覆盖（config.ts:515-521）
3. **显式配置**：settings 里配置的路径，以及命令行 `--extension` / `-e` 参数指定的文件（`packages/coding-agent/src/cli/args.ts:149`）

每个目录内部的发现规则写在 `discoverExtensionsInDir` 的注释里（loader.ts:626-668），只有三条：

- 目录下直接的 `*.ts` / `*.js` 文件 → 加载
- 子目录里有 `index.ts` / `index.js` → 加载这个入口
- 子目录里有 `package.json` 且带 `pi.extensions` 字段 → 按清单声明的路径加载

注意最后一条规则："**No recursion beyond one level**"——只扫一层，不递归。想组织复杂的扩展包，必须用 `package.json` 的 `pi` 字段显式声明入口（清单格式定义在 loader.ts:561-566，可声明 `extensions`、`themes`、`skills`、`prompts` 四类资源）。这是一个有意的取舍：文件系统约定越简单，加载行为越好预测。

---

## 加载：不编译，用 jiti 直接跑 TypeScript

扩展是 `.ts` 文件，Pi 怎么执行它？答案是 **jiti**——一个 Node.js 的运行时 TypeScript 加载器，不需要 tsc 编译步骤。核心代码在 `loadExtensionModule`（loader.ts:411-419）：

```typescript
const jiti = createJiti(import.meta.url, {
	moduleCache: false,
	// In Bun binary: use virtualModules for bundled packages (no filesystem resolution)
	// Also disable tryNative so jiti handles ALL imports (not just the entry point)
	// In Node.js/dev: use aliases to resolve to node_modules paths
	...(isBunBinary ? { virtualModules: VIRTUAL_MODULES, tryNative: false } : { alias: getAliases() }),
});

const module = await jiti.import(extensionPath, { default: true });
```

两行关键配置：

- `moduleCache: false`——**禁用模块缓存**。同一个文件每次 import 都重新读盘、重新执行。这一点后面讲热重载时会回来
- `alias` / `virtualModules`——把扩展里写的 `import ... from "@earendil-works/pi-coding-agent"` 重定向到 **Pi 自己正在运行的那份代码**（loader.ts:48-72），而不是去扩展旁边找 node_modules。这保证扩展和宿主用的是同一个 `ExtensionAPI` 类型、同一份运行时对象；在 Bun 打包的单文件二进制里，这些包被静态打进二进制，通过 `virtualModules` 直接喂给扩展

拿到模块后，`loadExtension` 完成"实例化"（loader.ts:463-479）：

```typescript
try {
	const factory = await loadExtensionModule(resolvedPath, cacheToken);
	time(`${extensionPath} module import`, "extensions");
	if (!factory) {
		return { extension: null, error: `Extension does not export a valid factory function: ${extensionPath}` };
	}

	const extension = createExtension(extensionPath, resolvedPath);
	const api = createExtensionAPI(extension, runtime, cwd, eventBus);
	await factory(api);
	time(`${extensionPath} factory`, "extensions");

	return { extension, error: null };
} catch (err) {
	// ...
}
```

三步：

1. `loadExtensionModule` 用 jiti 加载文件，拿到默认导出的 factory 函数；如果默认导出不是函数，直接报错
2. `createExtension` 创建一个 **Extension 对象**——它只是一堆空 Map：`handlers`、`tools`、`commands`、`shortcuts`、`flags`、渲染器等（loader.ts:433-452）。这就是前面说的"报名表"
3. `createExtensionAPI` 造出 `pi` 对象，然后 `await factory(api)`——**执行你的入口函数，让你把东西填进表里**

注意整个加载过程包在 try/catch 里：单个扩展加载失败只会进 `errors` 列表（loader.ts:526-529），不影响其他扩展，也不会让 Pi 起不来。对有自我改造能力的工具来说这是必要的容错——Agent 自己写了一个语法错误的扩展，不能把宿主搞挂。

---

## API 面：扩展能注册什么

`pi` 对象由 `createExtensionAPI` 构造（loader.ts:230-393），方法分两类：**注册类**（往报名表里填）和**动作类**（转发给运行时）。看注册类的核心三个（loader.ts:238-261）：

```typescript
on(event: string, handler: HandlerFn): void {
	runtime.assertActive();
	const list = extension.handlers.get(event) ?? [];
	list.push(handler);
	extension.handlers.set(event, list);
},

registerTool(tool: ToolDefinition): void {
	runtime.assertActive();
	extension.tools.set(tool.name, {
		definition: tool,
		sourceInfo: extension.sourceInfo,
	});
	runtime.refreshTools();
},

registerCommand(name: string, options: Omit<RegisteredCommand, "name" | "sourceInfo">): void {
	runtime.assertActive();
	extension.commands.set(name, {
		name,
		sourceInfo: extension.sourceInfo,
		...options,
	});
},
```

逐行看：

- `on(event, handler)` 是事件钩子：往 `extension.handlers` 这个 Map 里追加一个回调。同一个事件可以注册多个 handler
- `registerTool` 把工具定义按名字存进 `extension.tools`，然后调 `refreshTools()` 让工具列表立刻刷新
- `registerCommand` 注册斜杠命令：`options` 里有 `description`、`handler: async (args, ctx) => {...}`，还可以有 `getArgumentCompletions`（参数补全）

除了这三个，`pi` 上还有（全部可在 loader.ts:263-389 核实）：

- `registerShortcut`：键盘快捷键
- `registerFlag`：命令行 flag（如 `--plan`）
- `registerMessageRenderer` / `registerEntryRenderer`：**自定义 UI 渲染**——给自定义消息类型画终端界面
- `sendMessage` / `sendUserMessage` / `appendEntry`：往会话里注入消息或自定义条目
- `getActiveTools` / `setActiveTools`：动态增删当前生效的工具
- `setModel` / `setThinkingLevel`：换模型、调思考强度
- `registerProvider`：注册一个全新的模型提供商
- `exec`：执行 shell 命令

**事件钩子有哪些？** `types.ts` 里定义了全部事件名，按类别挑主要的（行号为事件类型的定义位置）：

| 类别 | 事件名 |
|-----|-------|
| 会话 | `session_start`、`session_shutdown`、`session_before_switch` / `fork` / `compact` / `tree`、`session_compact`、`session_tree`（types.ts:552-636） |
| Agent 循环 | `agent_start`、`agent_end`、`agent_settled`、`turn_start`、`turn_end`（types.ts:702-725） |
| 消息 | `message_start`、`message_update`、`message_end`（types.ts:733-746） |
| 工具 | `tool_call`、`tool_result`、`tool_execution_start` / `update` / `end`（types.ts:752-769, 843, 904） |
| 上下文 | `context`（每轮发给模型前可改写消息列表）、`before_agent_start`（注入消息/改系统提示）（types.ts:660, 689） |
| 提供商 | `before_provider_request`、`before_provider_headers`、`after_provider_response`（types.ts:666-682） |
| 其他 | `input`、`user_bash`、`model_select`、`project_trust`、`resources_discover` |

`context` 这个钩子值得单独点名：它在**每一轮请求发出前**被调用，handler 可以返回一个改写过的消息列表——这正是 [4.9](./context-engineering) 说的"按需注入"在代码上的落点，做 RAG、做长期记忆都挂在这里。

事件的返回值不是装饰，是有控制力的。以 `tool_call` 为例，`ExtensionRunner.emitToolCall`（runner.ts:915-936）：

```typescript
async emitToolCall(event: ToolCallEvent): Promise<ToolCallEventResult | undefined> {
	const ctx = this.createContext();
	let result: ToolCallEventResult | undefined;

	for (const ext of this.extensions) {
		const handlers = ext.handlers.get("tool_call");
		if (!handlers || handlers.length === 0) continue;

		for (const handler of handlers) {
			const handlerResult = await handler(event, ctx);

			if (handlerResult) {
				result = handlerResult as ToolCallEventResult;
				if (result.block) {
					return result;
				}
			}
		}
	}

	return result;
}
```

逻辑很直白：按加载顺序逐个调 handler，**任何一个 handler 返回 `{ block: true, reason }`，工具调用立即被拦截**，`reason` 会反馈给模型让它换做法。权限门禁、路径保护这类扩展就靠这一个返回值实现。

另一类值得注意的是"改写链"式事件：`emitContext`（runner.ts:967-997）把消息列表像流水线一样传给每个 handler，前一个的输出是后一个的输入；`emitMessageEnd`（runner.ts:818-858）允许 handler 改写模型发出的消息（但强制 role 不变）。而 `emit` 通用分发里，所有 handler 的异常都被 catch 住转成错误事件（runner.ts:802-811）——**一个扩展的 bug 不会炸掉整个会话**。

---

## 热重载：`/reload` 的完整代码路径

先纠正一个容易想当然的地方。

> ⚠️ **常见误解**："热重载 = 文件一保存就自动生效。" 在 v0.81.1 的源码里，Pi **没有**给扩展目录挂文件监听器——仓库里的 `watchWithErrorHandler` 工具函数（`packages/coding-agent/src/utils/fs-watch.ts:17`）只被主题文件和 footer 的 git 分支监听使用（`packages/coding-agent/src/core/footer-data-provider.ts:316`、`packages/coding-agent/src/modes/interactive/theme/theme.ts:937`），扩展不在其列。Pi 的"热"指的是**不重启进程、不丢会话历史地换掉整套扩展**，触发方式是显式的：用户敲 `/reload`，或者扩展代码里调 `ctx.reload()`。

重载的调用链是这样：

1. 交互模式检测到输入 `/reload`（`packages/coding-agent/src/modes/interactive/interactive-mode.ts:2733-2735`），调用 `handleReloadCommand()`（interactive-mode.ts:5304）。如果正在生成回复或正在压缩，会先拒绝（interactive-mode.ts:5306-5311）——重载要求系统处于空闲状态
2. `handleReloadCommand` 的关键一行是 `await this.session.reload(...)`（interactive-mode.ts:5357）
3. `AgentSession.reload()` 完成真正的重建（`packages/coding-agent/src/core/agent-session.ts:2603-2614`）：

```typescript
async reload(options?: { beforeSessionStart?: () => void | Promise<void> }): Promise<void> {
	const previousFlagValues = this._extensionRunner.getFlagValues();
	await emitSessionShutdownEvent(this._extensionRunner, { type: "session_shutdown", reason: "reload" });
	await this.settingsManager.reload();
	this.syncQueueModesFromSettings();
	resetApiProviders();
	await this._resourceLoader.reload();
	this._buildRuntime({
		activeToolNames: this.getActiveToolNames(),
		flagValues: previousFlagValues,
		includeAllExtensionTools: true,
	});
	// ...
}
```

逐行读：

- 先把旧的 flag 值（比如 `--plan` 这类开关状态）**存下来**，重建后原样塞回去——所以重载不会把你开着的模式关掉
- 给旧扩展发一个 `session_shutdown` 事件（reason 是 `"reload"`），让它们有机会收尾（写状态、关连接）
- 重载 settings、重置 API 提供商
- `this._resourceLoader.reload()` ——重新加载所有资源，下面细说
- `this._buildRuntime(...)` ——用新加载的扩展集合**重建整个 ExtensionRunner 和绑定关系**（agent-session.ts:2590-2591 重新执行 `_bindExtensionCore` / `_applyExtensionBindings`）

`DefaultResourceLoader.reload()`（`packages/coding-agent/src/core/resource-loader.ts:338-343`）干的第一件事：

```typescript
async reload(options?: ResourceLoaderReloadOptions): Promise<void> {
	resetTimings("extensions");

	if (this.loaded) {
		clearExtensionCache();
	}
	// ...
```

`clearExtensionCache()`（loader.ts:151-155）清空 factory 缓存并把"代数"计数器加一。配合前面看到的 jiti `moduleCache: false`，效果是：**下一次加载一定从磁盘重新读、重新执行扩展文件**——这就是"改完代码当场生效"在代码上的全部秘密。之后 resource-loader 重新扫描扩展、Skills、Prompt Templates、主题、`AGENTS.md` 等全部资源（resource-loader.ts:353-489）。最后 `AgentSession.reload` 向新扩展发 `session_start`（reason 是 `"reload"`，agent-session.ts:2623），新扩展完成初始化。

为什么"Agent 改自己的扩展、当场生效"成立？把整条链串起来：扩展只是磁盘上的 `.ts` 文件 → Agent 用 edit 工具改它（改的就是普通文件）→ jiti 无缓存加载保证下次读到的是新代码 → `/reload` 把 ExtensionRunner 整个换成新实例。链条上没有一环有"旧代码残留"的可能。还有一个细节保护：旧扩展持有的 `pi` / `ctx` 对象在重载后会被打上失效标记，再调用会抛错并提示"不要在 reload 后使用旧 ctx"（loader.ts:201-205、runner.ts:539-546），防止闭包里残留的旧引用悄悄作用于新会话。

> 💡 这个设计和 [4.8](./harness-engineering) 的零件视角对照着看：Pi 把"扩展运行时"做成了一个**可整体丢弃重建的零件**——没有进程内全局状态纠缠，所以重建是廉价的。热重载能做到多干净，取决于零件边界画得多干净。

---

## 官方示例读两个：permission-gate 与 plan-mode

仓库的 `packages/coding-agent/examples/extensions/` 目录有 60+ 个示例。挑两个最能说明"钩子组合"的。

**permission-gate.ts**（权限审批，34 行全文）：在危险 bash 命令执行前拦截并问用户。

```typescript
export default function (pi: ExtensionAPI) {
	const dangerousPatterns = [/\brm\s+(-rf?|--recursive)/i, /\bsudo\b/i, /\b(chmod|chown)\b.*777/i];

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return undefined;

		const command = event.input.command as string;
		const isDangerous = dangerousPatterns.some((p) => p.test(command));

		if (isDangerous) {
			if (!ctx.hasUI) {
				// In non-interactive mode, block by default
				return { block: true, reason: "Dangerous command blocked (no UI for confirmation)" };
			}

			const choice = await ctx.ui.select(`⚠️ Dangerous command:\n\n  ${command}\n\nAllow?`, ["Yes", "No"]);

			if (choice !== "Yes") {
				return { block: true, reason: "Blocked by user" };
			}
		}

		return undefined;
	});
}
```

只用了一个钩子 `tool_call`，但处理了三个要点：命中危险模式才介入；`ctx.hasUI` 判断当前有没有终端界面——**无 UI 的 print/RPC 模式默认拦截**（fail-closed，安全的默认姿势）；有 UI 时弹选择框，用户拒绝才 `block`。`ctx.ui.select` 就是扩展能拿到的 UI 能力之一，同族还有 `confirm`、`input`、`notify`、`setStatus`、`setWidget`、`editor` 等（完整列表见 runner.ts:233-264 的 `noOpUIContext`——非交互模式下它们全是空操作，这就是 `hasUI` 判断存在的原因）。

**plan-mode/**（子目录形式，入口 `index.ts`，390 行）：用一堆钩子组合出一个"只读探索模式"，这正是 4.17 说的"Plan mode 不内置、用扩展造"的实物。它用到的机制：

- `pi.registerFlag("plan", ...)`：加 `--plan` 启动参数（index.ts:53-57）
- `pi.registerCommand("plan", ...)` + `pi.registerShortcut(Key.ctrlAlt("p"), ...)`：命令和快捷键两种开关方式（index.ts:141-161）
- `pi.on("tool_call", ...)`：plan 模式下拦截不在白名单里的 bash 命令（index.ts:164-174）
- `pi.on("before_agent_start", ...)`：每轮开始前**注入一条 `display: false` 的隐藏消息**，告诉模型"你在 plan 模式，edit/write 已禁用"（index.ts:201-247）——隐藏注入是 `before_agent_start` 返回值的 standard 用法，runner 会收集所有 handler 返回的 message（runner.ts:1099-1101）
- `pi.on("context", ...)`：退出 plan 模式后，把历史里的 `[PLAN MODE ACTIVE]` 消息从上下文里**过滤掉**，避免过期指令污染后续对话（index.ts:177-198）——又是 [4.9](./context-engineering) 的老朋友
- `pi.on("turn_end", ...)`：扫描模型回复里的 `[DONE:n]` 标记，更新进度条 widget（index.ts:250-259）
- `pi.appendEntry("plan-mode", {...})` + `pi.on("session_start", ...)`：把模式状态写进会话文件，恢复会话时读回来（index.ts:116-123, 340-389）——扩展状态随会话持久化，这是树状会话文件带来的红利
- `pi.setActiveTools(...)`：进 plan 模式时把 `edit`/`write` 从生效工具里摘掉（index.ts:104-114）

值得停顿一下：这个扩展的实现里没有任何"特权接口"。拦截、注入、过滤、UI、持久化——全是 `pi` 对象上的公开 API。**官方能力和你能写的能力，用的是同一套零件**。

---

## Skills / Prompt Templates / Packages 的加载

扩展之外的三类资源，由同一个 `DefaultResourceLoader.reload()` 统一调度（resource-loader.ts:338-489），逻辑比扩展简单，简述：

- **Skills**：`loadSkills()`（`packages/coding-agent/src/core/skills.ts:387`）从 `~/.pi/agent/skills/` 和项目 `.pi/skills/` 扫描，规则是"目录里有 `SKILL.md` 就是一个技能"（skills.ts:161-168 的注释），重名时按加载顺序先到先得并记录 collision 诊断（skills.ts:410-426）
- **Prompt Templates**：`loadPromptTemplates()`（`packages/coding-agent/src/core/prompt-templates.ts:194`）扫 `prompts/` 目录下的 `.md` 文件，文件名去掉 `.md` 就是 `/命令` 名（prompt-templates.ts:109）
- **Packages**：`DefaultPackageManager`（`packages/coding-agent/src/core/package-manager.ts`）读取 settings 里的 `packages` 列表，支持 npm 包和 git 仓库两种来源（package-manager.ts:90），解出其中声明的 extensions / skills / prompts / themes 路径，交给 resource-loader 与本地资源合并去重（resource-loader.ts:354-402）

四类资源共用同一条"发现 → 合并 → 去重 → 诊断"流水线，这就是"能力即文件"在代码层面的样子：**加载器不关心能力是什么，只关心它在哪、叫什么、有没有冲突**。

---

## 🛠️ 实战练习：写一个 /hello 命令扩展

目标：写一个最小扩展，注册斜杠命令 `/hello`，并用 `/reload` 看到它当场生效。

1. **创建文件**：在全局扩展目录新建 `~/.pi/agent/extensions/hello-cmd.ts`（想只在某个项目生效，就放该项目的 `.pi/extensions/hello-cmd.ts`），内容：

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("hello", {
		description: "Say hello from your first extension",
		handler: async (args, ctx) => {
			const name = args.trim() || "world";
			ctx.ui.notify(`Hello, ${name}! (from hello-cmd.ts)`, "info");
		},
	});
}
```

2. **加载它**：启动 `pi`（如果已在会话里，敲 `/reload`），然后输入 `/hello pi` 回车
3. **改一改再验证**：把文件里的问候语改成别的，保存，敲 `/reload`，再执行 `/hello pi`

**期望结果**：第 2 步屏幕弹出通知 `Hello, pi! (from hello-cmd.ts)`；第 3 步**不重启 pi**，通知内容变成新文案——你刚刚亲手走完了一遍"文件 → jiti 加载 → 注册表 → `/reload` 重建"的完整链路。

**进阶挑战**：给扩展再加一个 `pi.on("tool_call", ...)` 钩子，拦截所有包含 `rm ` 的 bash 命令并返回 `{ block: true, reason: "..." }`，然后让 Agent 试着删除一个文件，观察模型收到 reason 后的反应（参考 `examples/extensions/permission-gate.ts` 的写法）。

---

## 📌 关键结论

1. 一个 Pi 扩展就是一个默认导出 `(pi: ExtensionAPI) => void` 的 `.ts` 文件；加载 = jiti 免编译 import + 执行入口函数填"注册表"，注册与运行严格分离
2. 扩展从项目 `.pi/extensions/`、全局 `~/.pi/agent/extensions/`、显式配置三处发现，目录只扫一层，复杂包靠 `package.json` 的 `pi` 字段声明入口
3. API 面覆盖工具、斜杠命令、快捷键、flag、UI 渲染和 30+ 个事件钩子；`tool_call` 返回 `block` 即可拦截，`context` / `before_agent_start` 可改写每轮上下文——权限门禁、plan mode 都是纯公开 API 的组合
4. "热重载"不是文件监听自动触发，而是 `/reload` 显式重建：`session_shutdown` → 清缓存 → 全量重读资源 → 重建 ExtensionRunner → `session_start`；jiti 的 `moduleCache: false` 和 runner 的可整体丢弃设计，让"Agent 改自己的工具当场生效"在代码上成立
5. Extensions / Skills / Prompt Templates / Packages 共用同一条资源加载流水线——"能力即文件"不是口号，是一套统一的发现-合并-去重机制

---

下一节：[4.23 Agent 协议全景：MCP / A2A / AG-UI / Skills](./agent-protocols)
