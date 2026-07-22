# 4.18 Pi 源码解剖（一）：四层架构与包结构

[4.17](./pi-harness) 讲了 Pi 的设计哲学——这一节开始，我们钻进源码，看这些哲学是怎么落成真实的目录、文件和依赖关系的。本节代码基于 `pi-mono` 仓库 **v0.81.1**（文中所有引用格式为 `packages/<pkg>/src/xxx.ts:行号`，建议你把源码克隆下来对照着读）。

读源码最怕"文件很多、不知从哪看起"。Pi 的 monorepo 恰好是治疗这种恐惧的好教材：它的四个核心包构成一条**严格的单向依赖链**，你顺着依赖方向读，就永远知道自己在哪一层。

## 四个包，一条单向依赖链

### 是什么：每层各管一件事

打开仓库根目录的 `packages/`，核心包有四个（另有 `storage/`、`server/` 等辅助包，不在主链上）。它们各自 package.json 里的 `description` 字段已经把职责说得很清楚：

| 包目录 | npm 包名 | 职责（官方 description 的直译） |
|-------|---------|-------------------------------|
| `packages/ai` | `@earendil-works/pi-ai` | 统一的 LLM API：多提供商适配、模型发现、流式协议 |
| `packages/agent` | `@earendil-works/pi-agent-core` | 通用 Agent 运行时：Agent Loop、传输抽象、状态管理 |
| `packages/tui` | `@earendil-works/pi-tui` | 终端 UI 库：差分渲染（differential rendering）、编辑器组件、Markdown 渲染 |
| `packages/coding-agent` | `@earendil-works/pi-coding-agent` | 编码 Agent CLI 产品：read/bash/edit 工具、会话管理、四种运行模式 |

一句话概括：**pi-ai 负责"跟模型说话"，pi-agent-core 负责"让模型干活"，pi-tui 负责"给人看界面"，pi-coding-agent 把三者组装成你敲 `pi` 时用到的那款产品。**

### 怎么做：用 package.json 的 dependencies 证明分层

"分层清晰"是架构文档里最常见的空话。验证它的方法很硬核：**看每个包 `dependencies` 里声明了哪些兄弟包**——依赖声明是构建工具强制执行的，造不了假。

最底层 `pi-ai` 的依赖（`packages/ai/package.json:62-74`）：

```json
"dependencies": {
	"@anthropic-ai/sdk": "0.91.1",
	"@aws-sdk/client-bedrock-runtime": "3.1048.0",
	"@google/genai": "1.52.0",
	"@mistralai/mistralai": "2.2.6",
	"openai": "6.26.0",
	"partial-json": "0.1.7",
	"typebox": "1.1.38"
}
```

（有删减）注意：里面**没有任何 `@earendil-works/*` 包**——全是各家模型厂商的官方 SDK。pi-ai 干的就是把这些风格迥异的 SDK 抹平成一套统一接口，自己不依赖任何兄弟包，因此它是依赖链的最底层。

往上一层，`pi-agent-core` 的依赖（`packages/agent/package.json:31-36`）：

```json
"dependencies": {
	"@earendil-works/pi-ai": "^0.81.1",
	"ignore": "7.0.5",
	"typebox": "1.1.38",
	"yaml": "2.9.0"
}
```

唯一的兄弟包依赖是 `pi-ai`。这意味着 agent-core 可以"跟模型说话"，但它对"用户在终端里看到了什么"**一无所知**——这一层没有任何 UI 概念。

再往上，`pi-coding-agent` 的依赖（`packages/coding-agent/package.json:41-44`）：

```json
"dependencies": {
	"@earendil-works/pi-agent-core": "^0.81.1",
	"@earendil-works/pi-ai": "^0.81.1",
	"@earendil-works/pi-tui": "^0.81.1",
	"@silvia-odwyer/photon-node": "0.3.4",
	"chalk": "5.6.2",
	...
}
```

三个兄弟包全在这里汇合——**只有最顶层的产品包同时依赖下面所有层**。这是典型的分层架构特征：下层对上层无感知，上层按需组装下层。

而 `pi-tui` 是个"编外人员"，它的依赖（`packages/tui/package.json:39-42`）：

```json
"dependencies": {
	"get-east-asian-width": "1.6.0",
	"marked": "18.0.5"
}
```

同样**零兄弟包依赖**——它不在 pi-ai → pi-agent-core 这条链上，而是与链平行的一个独立 UI 库。后面专门讲它。

把四条依赖声明画成图：

```
┌─────────────────────────────────────────────────────┐
│  pi-coding-agent  （CLI 产品：工具、会话、四种模式）    │
│  dependencies: pi-agent-core + pi-ai + pi-tui       │
└───────┬───────────────────────┬─────────────────────┘
        │                       │
        ▼                       ▼
┌───────────────┐       ┌───────────────────────────────┐
│ pi-agent-core │       │  pi-tui                       │
│ （Agent 运行时）│       │  （终端 UI 库，与 Agent 无关）   │
│ deps: pi-ai   │       │  deps: 无兄弟包                 │
└───────┬───────┘       └───────────────────────────────┘
        ▼
┌───────────────────────────────┐
│  pi-ai                        │
│  （统一 LLM API，15+ 提供商）   │
│  deps: 无兄弟包                 │
└───────────────────────────────┘
```

> 💡 **类比**：这条链像餐饮供应链——pi-ai 是**食材供应商**（只管把各产地原料标准化），pi-agent-core 是**中央厨房**（只管把食材做成菜，不管装盘和上菜），pi-tui 是**餐具厂**（跟厨房毫无关系，谁都能买它的盘子），pi-coding-agent 是**餐厅**——唯一同时接触三者的角色。你在餐厅吃到头发，该找餐厅；但食材出了问题，逐层往下溯源就行。分层最大的价值就是**问题可定位、每层可替换**。

### 为什么这样设计：单向依赖换来三个自由

为什么 Pi 要把代码切成四个包，而不是一个大仓库里几个文件夹了事？因为 npm 包级别的隔离带来三个实际的自由：

- **替换自由**：不喜欢 pi-tui 的交互？你自己写个 Web UI，照样复用 pi-agent-core 和 pi-ai——下层根本不关心上层是谁
- **复用自由**：pi-ai 可以单独发布、单独被别的项目 `npm install`（它甚至自带一个 `pi-ai` 命令行，`packages/ai/package.json` 的 `bin` 字段），不强迫你吞下整个 Agent
- **理解自由**：每一层的边界就是 `dependencies` 声明，读代码时你永远知道"这个文件能不能引用那个包"——答案写在 package.json 里，不靠口头约定

这和 [4.8](./harness-engineering) 说的 Harness 七个零件是同一枚硬币的两面：4.8 告诉你 Harness **逻辑上**由哪些零件构成，这四个包告诉你 Pi 在**物理上**把零件切成了可独立发布的单元。

---

## coding-agent 的 src：一个产品如何组装下层包

### 是什么：产品层 = 组装车间

`packages/coding-agent/src/` 是四个包里目录最多的，因为"产品"要做的事天然琐碎。顶层结构：

```
src/
├── cli.ts              # CLI 入口（20 行）
├── rpc-entry.ts        # RPC 入口（12 行）
├── main.ts             # 主装配函数（864 行，四种模式在这里分流）
├── index.ts            # SDK 出口（401 行 re-export）
├── config.ts           # 路径与版本常量
├── core/               # 产品核心：会话、工具、模型、压缩、扩展……
├── modes/              # 四种运行模式的实现
│   ├── interactive/    # 交互模式（TUI，含 components/ 和 theme/）
│   ├── print-mode.ts   # print/JSON 单次输出模式
│   └── rpc/            # RPC 模式（JSON 协议收发）
├── cli/                # 启动期辅助：参数解析、启动 UI、模型列表……
├── extensions/         # 内置扩展
├── bun/                # Bun 单文件可执行版本的专用入口
└── utils/              # 与 Agent 无关的工具函数（git、图片、剪贴板……）
```

### 怎么做：看 import 就知道谁在组装谁

"组装"不是修辞，是字面意义的 import。看产品层最核心的 `AgentSession` 类的开头（`packages/coding-agent/src/core/agent-session.ts:26-27`）：

```typescript
} from "@earendil-works/pi-agent-core";
import { contentText } from "@earendil-works/pi-ai";
```

`AgentSession` 是 coding-agent 的会话总管，但它**没有自己实现 Agent 循环**——循环在 pi-agent-core 里，它只做产品层该做的事：会话文件管理、斜杠命令、工具结果的产品化呈现。再看交互模式对 pi-tui 的消费（`packages/coding-agent/src/modes/interactive/interactive-mode.ts:24-40`）：

```typescript
import {
	CombinedAutocompleteProvider,
	type Component,
	Container,
	fuzzyFilter,
	getCapabilities,
	hyperlink,
	Markdown,
	matchesKey,
	ProcessTerminal,
	Spacer,
	setKeybindings,
	Text,
	TruncatedText,
	TUI,
	visibleWidth,
} from "@earendil-works/pi-tui";
```

交互模式没有写一行终端渲染代码：`TUI`（终端生命周期）、`Container`/`Text`/`Markdown`（组件）、`ProcessTerminal`（终端能力探测）全是 pi-tui 提供的现成零件。coding-agent 只负责把 Agent 事件翻译成"往哪个组件里塞什么内容"。

### 为什么这样设计：产品逻辑与引擎逻辑分账

为什么 `AgentSession` 不直接继承或吞掉 agent-core 的 `Agent`？因为两者的**变化频率**不同。引擎逻辑（怎么跑循环、怎么管理消息状态）变化慢、要求稳；产品逻辑（`AGENTS.md` 怎么分层加载、会话文件怎么存、HTML 怎么导出）变化快、跟用户口味强相关。分成两层后：

- pi-agent-core 可以服务**任何** Agent 产品（coding 只是其中一种），coding-agent 的产品决策不会污染引擎
- coding-agent 里所有"接地气"的代码——`utils/` 下的剪贴板、图片缩放、git 操作，`core/` 下的 HTML 导出、主题、遥测——都明确属于"产品"，不会被误认为 Agent 的必备零件

回头对照 [4.8](./harness-engineering) 的零件清单：模型适配在 pi-ai，Agent Loop 在 pi-agent-core，而"工具"这个零件在 coding-agent 的 `core/tools/` 里——**read/bash/edit/write 这些工具是产品层的资产，不属于引擎**。这是个值得记住的架构判断：引擎只定义"工具该长什么样"（接口），具体给 Agent 配什么工具，是产品的自由。

> ⚠️ **常见误解**："monorepo 里分包只是为了代码好看。" 不是。包边界是**构建与发布的边界**：pi-ai、pi-agent-core、pi-tui 都单独发布到 npm（版本号同为 0.81.1），任何人可以只装其中一个用。文件夹隔离靠自觉，包隔离靠工具链强制执行——后者才是真的边界。

---

## pi-tui：为什么它不属于 Agent 体系

### 是什么：一个通用终端 UI 库

pi-tui 的 package.json 描述说得很直白："Terminal User Interface library with differential rendering"——**它是一个通用终端 UI 库，整份源码里没有任何 LLM、Agent、消息的概念**。`packages/tui/src/` 下的文件清单像任何一个 UI 库：`tui.ts`（主循环）、`terminal.ts`（终端抽象）、`components/`（组件）、`editor-component.ts`（多行编辑器）、`autocomplete.ts`（自动补全）、`keybindings.ts`（快捷键）、`undo-stack.ts`（撤销栈）。

它的两个依赖也在说明它的"通用性"（`packages/tui/package.json:39-42`，上面贴过）：`marked` 是 Markdown 解析器，`get-east-asian-width` 用来算中日韩全角字符在终端里的显示宽度——这是做终端 UI 都绕不开的脏活，与 AI 无关。

### 怎么做：Agent 事件 → UI 组件，单向翻译

pi-tui 与 Agent 体系的接触面只有一种形状：**coding-agent 的交互模式 import 它的组件，把 Agent 事件翻译进去**。上面 interactive-mode.ts 的 import 清单就是证据——方向是单向的，pi-tui 永远不会反过来 import coding-agent 或 pi-agent-core 的任何东西（它的 dependencies 里没有，也 import 不到）。

### 为什么这样设计：UI 是四种模式里只有一种需要的奢侈品

这是最容易被忽略、也最能体现"零件思维"（呼应 [4.17](./pi-harness) 的 Primitives, not features）的一个决策。想一想：四种运行模式里，**只有交互模式需要 TUI**。print 模式往 stdout 写字，RPC 模式走 JSON 协议，SDK 模式被嵌进别人的应用——它们都不该为终端渲染付出任何代价。

如果 UI 和 Agent 揉在一起，print/RPC/SDK 三种模式就会被拖进终端渲染的依赖泥潭（原生模块、终端能力探测、渲染循环）。解耦之后：pi-tui 是可插拔的，换成 Web 前端、VS Code 插件、手机 App，Agent 体系一行不用改。**UI 是 Agent 能力的一种"呈现"，不是能力本身**——这条认知对你设计自己的 Agent 产品同样成立。

---

## 四种运行模式在入口代码里怎么分流

### 是什么：两个入口文件，一个分流函数

4.17 列过四种模式的用途表，这里看源码实现。package.json 先告诉你"门在哪"（`packages/coding-agent/package.json:9-22`）：

```json
"bin": {
	"pi": "dist/cli.js"
},
"main": "./dist/index.js",
"exports": {
	".": { "import": "./dist/index.js" },
	"./rpc-entry": { "import": "./dist/rpc-entry.js" }
}
```

- 你敲 `pi`，进 `cli.js`（源码是 `cli.ts`）
- 别的程序 `import "@earendil-works/pi-coding-agent"`，进 `index.js`（源码是 `index.ts`）——这是 SDK 模式
- 非 Node 系统起 RPC 子进程时，用 `rpc-entry` 这个子路径出口（源码是 `rpc-entry.ts`）

### 怎么做：三次分流，层层收窄

**第一次分流：入口文件。** 两个 CLI 入口都是"薄壳"。`packages/coding-agent/src/cli.ts` 全文 20 行：

```typescript
#!/usr/bin/env node
import { APP_NAME } from "./config.ts";
import { configureHttpDispatcher } from "./core/http-dispatcher.ts";
import { main } from "./main.ts";

process.title = APP_NAME;
process.env.PI_CODING_AGENT = "true";
process.emitWarning = (() => {}) as typeof process.emitWarning;

// Configure undici's global dispatcher before provider SDKs issue requests.
configureHttpDispatcher();

main(process.argv.slice(2));
```

逐段读：设置进程名 → 打 `PI_CODING_AGENT` 环境标记（让子进程知道自己被 Agent 启动）→ 屏蔽 Node 警告噪音 → 配好 HTTP 代理分发器（必须在各厂商 SDK 发请求**之前**配）→ 把命令行参数交给 `main()`。而 `rpc-entry.ts`（`packages/coding-agent/src/rpc-entry.ts:12`）更直接：

```typescript
main(["--mode", "rpc", ...process.argv.slice(2)]);
```

**RPC 模式没有独立实现入口——它只是往参数前面硬塞了一个 `--mode rpc`，然后走同一个 `main()`。** 这保证 RPC 和普通 CLI 永远共享同一套参数解析、模型加载、会话创建逻辑，不会因入口不同而行为漂移。

**第二次分流：`resolveAppMode` 决定模式。** 在 `main.ts` 里（`packages/coding-agent/src/main.ts:100-111`）：

```typescript
function resolveAppMode(parsed: Args, stdinIsTTY: boolean, stdoutIsTTY: boolean): AppMode {
	if (parsed.mode === "rpc") {
		return "rpc";
	}
	if (parsed.mode === "json") {
		return "json";
	}
	if (parsed.print || !stdinIsTTY || !stdoutIsTTY) {
		return "print";
	}
	return "interactive";
}
```

优先级一目了然：显式 `--mode rpc` 最高；`--mode json` 次之；然后是 `pi -p`（`parsed.print`）**或者 stdin/stdout 不是 TTY**——也就是说 `echo "..." | pi` 或 `pi ... > out.txt` 会自动落入 print 模式；全都不满足，才进交互模式。这个"管道即 print"的判定，是它能无缝进 shell 脚本和 CI 的关键。

**第三次分流：`main()` 末尾的 if-else。** 所有模式共享漫长的准备阶段（加载设置、解析模型、创建 `AgentSession`），只在最后一步才分开跑（`packages/coding-agent/src/main.ts:816-856`，有删减）：

```typescript
if (appMode === "rpc") {
	await runRpcMode(runtime);
} else if (appMode === "interactive") {
	const interactiveMode = new InteractiveMode(runtime, {
		migratedProviders,
		modelFallbackMessage,
		initialMessage,
		initialImages,
		// ...
	});
	await interactiveMode.run();
} else {
	const exitCode = await runPrintMode(runtime, {
		mode: toPrintOutputMode(appMode),
		messages: parsed.messages,
		initialMessage,
		initialImages,
	});
	if (exitCode !== 0) {
		process.exitCode = exitCode;
	}
	return;
}
```

三个分支拿到的**是同一个 `runtime`**（内含同一个 `AgentSession`）。`runRpcMode` / `InteractiveMode` / `runPrintMode` 从 `./modes/index.ts` 导入（`packages/coding-agent/src/main.ts:46`），而 `modes/index.ts` 本身只是三个模式文件的 re-export（`packages/coding-agent/src/modes/index.ts:5-8`）。

**SDK 模式在哪？** 它根本不走 `main()`。`packages/coding-agent/src/index.ts` 是一张 401 行的 re-export 清单，把产品能力按主题暴露给宿主程序，比如开头几段（`packages/coding-agent/src/index.ts:15-25,51`）：

```typescript
export {
	AgentSession,
	type AgentSessionConfig,
	type AgentSessionEvent,
	// ...
} from "./core/agent-session.ts";
// ...
export { createEventBus, type EventBus, type EventBusController } from "./core/event-bus.ts";
```

宿主程序 `import { AgentSession } from "@earendil-works/pi-coding-agent"`，自己造会话、自己驱动——SDK 用户拿到的不是"另一种运行模式"，而是**构成那三种模式的同一批零件**。

### 为什么这样设计：准备阶段共享，呈现阶段分离

把四种模式的分流点画在 `main()` 的**末尾**而不是开头，是刻意的。共享的准备阶段意味着：你在交互模式下调好的模型、设置、`AGENTS.md`（[4.17](./pi-harness) 讲过的分层加载，正是 [4.9](./context-engineering)"外部记忆"手法的落地），在 `pi -p`、RPC、CI 里行为**完全一致**——没有"脚本模式下某个配置不生效"这种坑。分离的只有"呈现"：同一份 Agent 事件流，交互模式渲染成 TUI 组件，print 模式写成文本，json 模式写成 JSON 事件行，RPC 模式走协议收发。

> 💡 **类比**：这像一家餐厅有堂食、外卖、企业团餐三种接单方式——接单渠道不同，但**后厨是同一个**。菜品的质量不因渠道漂移，因为分流点设在"出餐口"（呈现），而不是设在"厨房"（准备）。

---

## 🛠️ 实战练习：亲手验证依赖链与分流

前提：克隆源码并切到本书使用的版本，后续四节都用它：

```bash
git clone https://github.com/earendil-works/pi.git pi-src && cd pi-src
git checkout v0.81.1
```

1. **验证分层**：用 `grep -A 10 '"dependencies"' packages/*/package.json` 分别查看四个包的依赖，确认：pi-ai 和 pi-tui 的 dependencies 里没有 `@earendil-works/*`，pi-agent-core 只依赖 pi-ai，只有 pi-coding-agent 同时依赖三个兄弟包
2. **验证 tui 解耦**：在 `packages/tui/src/` 下 `grep -ri "agent\|llm\|anthropic" --include="*.ts" -l`，确认命中数为零或只有注释级别的巧合——一个 UI 库不该认识这些词
3. **追踪分流**：打开 `packages/coding-agent/src/main.ts`，找到 `resolveAppMode` 函数，回答：执行 `echo "hello" | pi` 会进哪个模式？为什么？（提示：看 `stdinIsTTY` 那个条件）
4. **摸清 SDK 出口**：浏览 `packages/coding-agent/src/index.ts`，数出它 re-export 了哪几个主题（会话、压缩、扩展、工具……），挑一个你感兴趣的顺着 import 跳进去读实现

**期望结果**：完成第 1、2 步后，你不再依赖任何文章（包括本书）的转述，能自己用 package.json 论证一个 monorepo 的分层是否干净；完成第 3、4 步后，你能徒手画出"从 `pi` 命令到四种模式"的调用路径。

**进阶挑战**：写一个 20 行的 Node.js 脚本，`import { AgentSession }` 自 `@earendil-works/pi-coding-agent`（或用 workspace 内的相对路径），创建会话并发送一条消息，把事件打印到控制台——你就亲手造出了"第五种模式"，同时验证了 SDK 出口的真实性。需要为你选用的模型提供商配置对应的 API Key 环境变量（如 `ANTHROPIC_API_KEY` 或 `OPENAI_API_KEY`）。

---

## 📌 关键结论

1. Pi 的 monorepo 是四个可独立发布的包：`pi-ai`（模型层）→ `pi-agent-core`（引擎层）→ `pi-coding-agent`（产品层），外加一条与 Agent 无关的平行线 `pi-tui`；**这条分层不需要文档背书，各包 package.json 的 `dependencies` 就是可验证的证明**
2. coding-agent 是"组装车间"：`AgentSession` 直接消费 agent-core 的循环与 pi-ai 的接口，交互模式直接消费 pi-tui 的组件——产品层只做产品决策，不重造引擎
3. pi-tui 零兄弟包依赖、源码无 Agent 概念，因为四种模式里只有交互模式需要 UI——**UI 是能力的呈现，不是能力本身**
4. 四种模式的分流发生在 `main()` 末尾：`cli.ts` 与 `rpc-entry.ts` 是两个薄入口，`resolveAppMode` 按 `--mode` / `-p` / TTY 状态定模式，三种模式共享同一个 `AgentSession` 准备阶段；SDK 则绕过 `main()`，由 `index.ts` 直接出口零件
5. 读 Agent 源码的通用方法：**先读 package.json 确立分层地图，再从入口文件顺依赖往下钻**——下节我们就用这个方法进入最核心的 `agent-loop.ts`

---

下一节：[4.19 Pi 源码解剖（二）：Agent Loop](./pi-source-agent-loop)
