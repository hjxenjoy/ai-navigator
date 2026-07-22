# 4.23 Agent 协议全景：MCP / A2A / AG-UI / Skills

> 🕐 内容截至 2026-07｜涉及版本：A2A v1.0

2024 年底 MCP 刚出现时，"Agent 协议"几乎就是 MCP 的代名词。但到 2026 年，情况变了：Agent 互操作已经分化成一个**分层协议栈**——MCP 管 agent 到工具，A2A 管 agent 到 agent，AG-UI 管 agent 到前端，ACP 管编辑器到 agent，Agent Skills 管能力打包，AGENTS.md 管项目指令。

这一节把整张地图摊开，讲清每层解决什么问题、谁在做、治理归谁，以及你该在什么场景用哪一层。

---

## 为什么一个协议不够用

一个真实的 Agent 应用，边界远不止"模型调工具"这一处：

```
用户 ←→ 前端 UI ←→ Agent A ←→ Agent B（另一个团队/另一家公司的 Agent）
                    ↕
                 工具、数据
                    ↕
              编辑器、IDE
```

每一处箭头都是一种通信关系，通信双方的角色、信任模型、交互模式完全不同：

- Agent 调工具：短平快的请求-响应，工具是"被动资源"
- Agent 调 Agent：可能是跨组织、长时间运行的任务，对方是"对等协作者"
- Agent 对前端：持续的事件流，人要随时介入
- 编辑器对 Agent：IDE 要嵌入 agent 的会话、diff、终端

用一个协议硬套所有场景，结果就是协议越来越臃肿。**2025-2026 年行业的答案是分层：每层一个专注的协议。**

---

## 一张表看懂协议栈

| 层 | 协议 | 通信方向 | 主导方 | 状态（截至 2026-07） |
|----|------|---------|--------|---------------------|
| 工具层 | **MCP** | agent → 工具/数据 | Anthropic 发起，现归 Linux 基金会 AAIF | 事实标准，详见 [4.1](./index) |
| 协作层 | **A2A** | agent ↔ agent | Google 发起，现归 Linux 基金会 | v1.0 已发布 |
| 交互层 | **AG-UI** | agent ↔ 前端应用 | CopilotKit | 生产可用 |
| 编辑器层 | **ACP** | 编辑器 ↔ agent | Zed | 细分场景可用 |
| 能力打包 | **Agent Skills** | （静态格式，非通信协议） | Anthropic | 开放标准，30+ 工具兼容 |
| 项目指令 | **AGENTS.md** | （静态约定，非通信协议） | OpenAI 发起，现归 AAIF | 事实标准 |

注意最后两行：**Agent Skills 和 AGENTS.md 不是通信协议，而是"内容格式与目录约定"**——它们不规定数据怎么传，只规定"能力包"和"项目指令"长什么样、放在哪。把它们放进这张表，是因为工程实践中它们解决的是同一类问题：让不同厂商的 agent 能互相理解。

> 💡 **类比**：把 Agent 系统想象成一家公司。MCP 是员工和办公设备之间的接口（插座、内网系统账号）；A2A 是部门和部门之间、公司和外部供应商之间的合作流程（提工单、签合同、验收）；AG-UI 是员工和客户的沟通界面（客服系统）；ACP 是员工工位本身的规格；Agent Skills 是标准化的岗位培训手册——谁拿到都能上岗；AGENTS.md 则是贴在新人入职包第一页的公司规章制度。每一层都有用，但没有哪一层能代替另一层。

---

## A2A：Agent 之间的协议

A2A（Agent2Agent）是这张图里 2026 年变化最大的一层，值得展开讲。

### 时间线

- **2025 年 4 月**：Google 发布 A2A，定位是"agent 之间互相发现、通信、委派任务"的开放协议
- **2025 年 6 月**：Google 把 A2A 捐给 Linux 基金会，转为中立的社区治理
- **2026 年 4 月**：A2A v1.0 正式发布，引入多协议绑定（JSON-RPC、gRPC、REST）、签名的 Agent Card、企业级多租户等能力

据 Linux 基金会披露的数据，支持 A2A 的组织已超过 150 家，包括 Google、Microsoft、AWS、Salesforce、SAP 等；Google Cloud、AWS、Azure 三大云都已提供支持。据第三方报道，金融、供应链等领域已有生产级部署（如 Salesforce Agentforce 把自定义 agent 暴露为 A2A 端点，SAP Joule 跨系统委派任务给合作方 agent）。

### 核心概念一：Agent Card（能力发现）

每个 A2A agent 在一个约定 URL 上发布一张 **Agent Card**——一个 JSON 文档，声明"我是谁、我会做什么、怎么和我通信"：

```json
{
  "name": "invoice-agent",
  "description": "处理发票查验与报销审核",
  "url": "https://agents.example.com/invoice",
  "version": "1.0.0",
  "capabilities": {
    "streaming": true,
    "pushNotifications": true
  },
  "skills": [
    {
      "id": "verify-invoice",
      "name": "发票查验",
      "description": "根据发票号码查验真伪并返回查验结果"
    }
  ]
}
```

调用方 agent 先读 Agent Card，判断对方能不能干这件事，再决定要不要把任务委派过去。这解决了多 agent 系统的第一个难题：**发现（discovery）**——不用硬编码每个协作者的能力。

### 核心概念二：Task（任务生命周期）

A2A 不把 agent 间交互建模为"一问一答"，而是建模为**有生命周期的 Task**：

```
submitted → working → input-required → working → completed
                    ↘ failed / canceled
```

关键状态：

- `submitted` / `working`：任务已提交、执行中（可以是几小时甚至几天的长任务）
- `input-required`：**agent 执行到一半需要补充信息**，任务挂起等待输入——这是人机协同和 agent 间协同的关键状态
- `completed` / `failed` / `canceled`：终态

任务执行过程中产出的结果文件叫 **Artifact**，进度更新可以通过流式推送或 webhook 通知。这套模型明显是为**跨组织、长时间运行**的协作设计的，和 MCP 的"调一个工具、拿一个结果"不是一个量级的问题。

### 和 MCP 的关系：互补，不是竞争

一句话记牢：**A2A 在 agent 之间，MCP 从 agent 到工具。**

```
Agent A ──A2A──→ Agent B（对等的协作者，有自己的策略和状态）
Agent A ──MCP──→ 数据库 / API / 文件系统（被动的工具和资源）
```

一个典型架构里两者同时存在：Agent B 通过 A2A 接到任务后，自己内部再用 MCP 调它需要的工具完成任务。

> ⚠️ **常见误解**："A2A 出来了，MCP 要被淘汰了。"这是 2025 年很流行的误读。两者解决的问题正交：MCP 连接的是 agent 和**工具**（无自主性的资源），A2A 连接的是 agent 和 **agent**（有自主性的对等方）。两个协议如今都在 Linux 基金会旗下，官方定位就是互补。选型时问"MCP 还是 A2A"本身就是错误的问题——该问的是"我这个通信对端是工具还是 agent"。

---

## AG-UI：Agent 到前端的协议

MCP 和 A2A 都发生在后端。但 Agent 应用还有一条面向用户的边界：agent 的运行过程（打字机输出、工具调用、等待审批）怎么实时同步到前端界面？

在 AG-UI 之前，每个团队都自己糊一套 WebSocket / SSE 协议，前端和后端 agent 框架紧耦合。**AG-UI（Agent-User Interaction Protocol）** 由 CopilotKit 主导，把这件事标准化了：一个开放的、基于事件的协议，定义 agent 后端向前端推送哪些事件。

它标准化的事件类型包括：

- **Token 流**：模型输出的逐字流式渲染
- **工具调用可视化**：agent 调了什么工具、参数是什么、结果是什么，前端可以渲染成结构化卡片
- **中断与审批（Human-in-the-Loop）**：agent 执行到敏感操作时发中断事件，前端弹出审批界面，用户批准后 agent 继续
- **共享状态（Shared State）**：agent 的内部状态双向同步到前端，前端改了状态 agent 也能感知

生态上，LangGraph、CrewAI、Mastra、PydanticAI 等主流 agent 框架都已提供 AG-UI 集成，Google、AWS、Microsoft 的相关框架也有采纳。据第三方报道，其周安装量在 2025 年 10 月已突破 12 万，是目前 agent-前端层事实上的主流方案。

**什么时候需要它**：你在做一个有自定义前端的 Agent 产品（不是纯 CLI），而且不想被某个前端 SDK 锁死。

---

## ACP：编辑器到 Agent 的协议

ACP（Agent Client Protocol）是 Zed 编辑器发起的协议，解决的是一个更细分的问题：**代码编辑器怎么接入各种 coding agent**。

它的角色设计有个有趣的反转：**编辑器是 client，agent 是 server**。编辑器（Zed）通过 ACP 启动 agent 子进程，用 JSON-RPC 通信，把会话、diff 展示、终端输出嵌入编辑器 UI。Gemini CLI、Claude Code 等 coding agent 都支持通过 ACP 接入 Zed。

对大多数应用开发者来说，ACP 是"知道即可"的一层——它是给编辑器厂商和 coding agent 厂商用的。但如果你在做 IDE 插件或者自己的 coding agent，这层就和你直接相关。

> ⚠️ **常见误解**：ACP 和 A2A 名字像，但完全是两个东西。ACP 管"编辑器 ↔ coding agent"这一条本地链路，不处理 agent 之间的协作；跨 agent 协作是 A2A 的领域。另外注意历史上还有一个 IBM 提出的同名 ACP（Agent Communication Protocol），其思路已并入 A2A——搜资料时注意区分上下文。

---

## Agent Skills：能力打包的开放格式

前面四个都是"数据怎么传"的协议，Agent Skills 是"能力怎么打包"的格式约定。

**时间线**：Anthropic 于 2025 年 10 月为 Claude 发布 Skills 功能，2025 年 12 月 18 日将其发布为开放标准，规范托管在 [agentskills.io](https://agentskills.io)。此后微软、OpenAI、Cursor、GitHub 等相继采纳，目前兼容工具超过 30 个。

Skill 本身的技术形态在 [5.10](/ch5-deep-dives/skills-intro) 有详细讲解（一个文件夹，核心是 `SKILL.md`）。这一节重点是它的**跨客户端目录约定**：

```
项目级：  <你的项目>/.agents/skills/my-skill/SKILL.md
用户级：  ~/.agents/skills/my-skill/SKILL.md
```

- **项目级**：跟着 Git 仓库走，团队成员 clone 下来就能用，适合和项目强相关的能力（如"按本仓库规范写 migration"）
- **用户级**：你个人在所有项目里都能用，适合个人工作流（如"按我的习惯生成 commit message"）

写一个 Skill、放到约定目录，Claude Code、Codex、Gemini CLI、Cursor 等兼容工具都能加载——这是 Agent Skills 作为标准的核心价值。

---

## AGENTS.md：给 Agent 的项目说明书

AGENTS.md 是 OpenAI 发起的约定（本书你正在读的这份 CLAUDE.md 就是同类文件的 Claude 版）：在仓库根目录放一个 `AGENTS.md`，写明项目的构建命令、代码规范、测试方式，所有兼容的 coding agent 进入项目时都会读它。

它同样不是通信协议，而是一个"放对位置、大家就都会读"的静态约定。

---

## 治理格局：谁拥有这些标准

选协议就是在选治理方，这部分容易搞混，拉直了说：

- **AAIF（Agentic AI Foundation）**：2025 年 12 月在 Linux 基金会旗下成立，创始项目有三个——Anthropic 的 **MCP**、OpenAI 的 **AGENTS.md**、Block 的 **goose**。白金会员包括 AWS、Google、Microsoft、Anthropic、OpenAI 等
- **A2A**：Google 于 2025 年 6 月捐给 **Linux 基金会**（早于 AAIF 成立）
- **Agent Skills**：虽然采纳者众多，但截至 2026-07，**这个标准仍由 Anthropic 主导维护**，托管在 agentskills.io，**并不在 AAIF 名下**——不要因为它和 MCP 都源自 Anthropic 就默认它们归属相同

整体趋势是治理向中立基金会收敛，但收敛并不均匀。做技术选型时，"这个标准归谁管"直接影响它的长期中立性和演进方向。

---

## 实战意义：怎么选

| 你的场景 | 用哪层 |
|---------|--------|
| Agent 要调数据库、API、文件 | MCP |
| 多个独立 agent（跨团队/跨公司/长任务）协作 | A2A |
| 给 Agent 做自定义前端界面 | AG-UI |
| 做编辑器插件或 coding agent 接入 IDE | ACP |
| 把一套工作流/知识打包给多个 agent 工具复用 | Agent Skills |
| 告诉 coding agent 本项目的规矩 | AGENTS.md |

大多数项目从 MCP + AGENTS.md 起步就够了，A2A 和 AG-UI 在系统真正变大、出现对应边界时再引入。

---

## 🛠️ 实战练习

动手感受协议栈的两端：写一个跨工具可加载的 Skill，再写一张 A2A Agent Card 并程序化校验它。

**步骤：**

1. 创建项目级 Skill 目录和文件：

```bash
mkdir -p .agents/skills/commit-msg
```

创建 `.agents/skills/commit-msg/SKILL.md`：

```markdown
---
name: commit-msg
description: 按照 Conventional Commits 规范生成中文 commit message。当用户要求提交代码或写 commit message 时使用。
---

# Commit Message 生成规则

1. 先运行 `git diff --staged` 查看暂存的改动
2. 格式：`<type>(<scope>): <中文描述>`，type 从 feat/fix/docs/refactor/test/chore 中选
3. 描述不超过 50 字，结尾不加句号
4. 如果改动涉及多个不相关的关注点，提示用户拆开提交
```

2. 写一张 Agent Card。创建 `agent-card.json`：

```json
{
  "name": "my-first-agent",
  "description": "练习用 Agent：回答关于本仓库代码结构的问题",
  "url": "https://agents.example.com/my-first-agent",
  "version": "0.1.0",
  "capabilities": { "streaming": false, "pushNotifications": false },
  "skills": [
    {
      "id": "explain-repo",
      "name": "仓库结构讲解",
      "description": "根据用户问题解释本仓库的目录结构和关键文件"
    }
  ]
}
```

3. 写一个校验脚本 `validate-card.mjs`，检查 Agent Card 的必填字段：

```javascript
import fs from 'fs'

const card = JSON.parse(fs.readFileSync('./agent-card.json', 'utf-8'))

const required = ['name', 'description', 'url', 'version', 'capabilities', 'skills']
const missing = required.filter((field) => !(field in card))

if (missing.length > 0) {
  console.error(`❌ Agent Card 缺少必填字段：${missing.join(', ')}`)
  process.exit(1)
}

if (!Array.isArray(card.skills) || card.skills.length === 0) {
  console.error('❌ skills 必须是非空数组，否则别的 Agent 不知道你会什么')
  process.exit(1)
}

for (const skill of card.skills) {
  for (const field of ['id', 'name', 'description']) {
    if (!skill[field]) {
      console.error(`❌ skill 缺少字段 ${field}：`, JSON.stringify(skill))
      process.exit(1)
    }
  }
}

console.log(`✅ Agent Card 校验通过：${card.name} v${card.version}，声明了 ${card.skills.length} 项技能`)
```

运行 `node validate-card.mjs`。

4. 故意删掉 `agent-card.json` 里的 `version` 字段再运行一次，观察校验脚本报错。

**期望结果**：第 3 步输出 `✅ Agent Card 校验通过：my-first-agent v0.1.0，声明了 1 项技能`；第 4 步输出缺少 `version` 的报错并以退出码 1 结束。

**进阶挑战**：把 `commit-msg` Skill 复制到用户级目录 `~/.agents/skills/commit-msg/`，然后在你用的 agent 工具（Claude Code、Codex 等）里让它帮你写一次真实的 commit message，验证跨目录加载是否生效；再删掉项目级副本，确认用户级 Skill 依然可用。

---

## 📌 关键结论

- 2026 年的 Agent 互操作是一个**分层协议栈**：MCP（agent→工具）、A2A（agent↔agent）、AG-UI（agent↔前端）、ACP（编辑器↔agent），外加两种静态格式约定 Agent Skills（能力打包）和 AGENTS.md（项目指令）
- A2A 的核心是 **Agent Card**（能力发现）和 **Task 生命周期**（含 `input-required` 挂起态，为跨组织长任务设计）；它和 MCP 是互补关系——"A2A 在 agent 之间，MCP 从 agent 到工具"
- A2A 由 Google 发起、已捐给 Linux 基金会，2026 年 4 月发布 v1.0，支持组织超 150 家、三大云均已支持
- 治理在收敛但不均匀：MCP / AGENTS.md / goose 归 Linux 基金会 AAIF，而 Agent Skills 标准仍由 Anthropic 维护——选协议时要看清归属
- 工程上从 MCP + AGENTS.md 起步，出现 agent 间协作或自定义前端的真实需求时再引入 A2A / AG-UI

下一节：[4.24 云端异步 Coding Agent 与 Agent Teams](./async-coding-agents)
