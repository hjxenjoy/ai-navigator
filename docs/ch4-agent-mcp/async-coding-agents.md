# 4.24 云端异步 Coding Agent 与 Agent Teams

> 🕐 内容截至 2026-07｜涉及版本：Claude Code 2.1.x（Agent Teams 仍为实验特性）/ Managed Agents API（`managed-agents-2026-04-01`）

[4.4](./claude-code) 讲的 Claude Code 是一个"坐在你终端里"的 Agent：你盯着它干活，随时打断、随时审查。但 2025 到 2026 年，Coding Agent 分化出了第三种形态——**云端异步 Agent**：你派一个任务出去，它在云端的沙箱里自己跑几十分钟甚至几小时，回来时带着一个等你 review 的 PR。这一节讲这三种执行模型的分化、Background Agent 的工作流，以及随之而来的多 Agent 并行产品（Agent Teams）和它们的成本治理问题。

---

## 三种执行模型的分化

今天的 Coding Agent 按"在哪里运行、人如何参与"分成三类：

| 执行模型 | 代表产品 | 人的角色 | 适合的任务 |
|---------|---------|---------|-----------|
| 本地终端人审式 | Claude Code（[4.4](./claude-code)） | 全程在场，逐轮确认 | 聚焦重构、复杂调试、需要反复对齐方向的任务 |
| IDE 内嵌式 | Cursor、Windsurf | 边写边看，接受/拒绝 diff | 日常编码、补全、小步改动 |
| 云端异步沙箱 | Codex cloud、Devin、Jules | 派任务 → 离开 → 回来收 PR | 边界清晰、可独立验证的后台任务 |

> 💡 **类比**：这三种模式对应三种用人方式。本地终端是"结对编程"——同事坐你旁边，每改一处你都看着；IDE 内嵌是"副驾驶"——你开车它递扳手；云端异步是"外包"——你写好需求文档发出去，对方交活儿时你做 Code Review。外包的前提是你能把需求写清楚、把验收标准定明白，否则回来的东西一定不是你想要的。

2026 年主流团队的真实用法是**双轨制混用**，而不是选一个站队：

- **本地轨道**：聚焦的、方向感强的任务——核心模块重构、疑难 bug——用 Claude Code 这类本地 Agent，人全程在环（方法论见 [4.7](./ai-coding-workflow)）
- **云端轨道**：边界清晰的后台任务——给依赖升级写迁移、补一批测试、修一堆 lint 告警——派给云端 Agent 并行跑，人只做最后的 PR review

> ⚠️ **常见误解**："云端异步 Agent 是本地 Agent 的升级版，最终会取代它。"不是。两者的瓶颈不同：本地 Agent 的瓶颈是模型能力（它够不够聪明），云端 Agent 的瓶颈是**任务定义能力**（你能不能把任务切得足够独立、验收标准写得足够明确）。很多任务根本切不出去——比如"这个架构感觉不对，我们聊聊怎么调"，这类任务永远属于本地轨道。

---

## Background Agent 工作流：派 issue，收 PR

云端异步 Agent 的标准工作流已经收敛成一个固定形状：

```
1. 你（或 PM）在 GitHub 上开一个 issue，写清楚：
   - 要做什么、不做什么
   - 验收标准（跑通哪些测试 / 满足什么行为）
2. 把 issue 指派给 Agent（如 Codex cloud、Devin）
3. Agent 在云端沙箱里：拉代码 → 装依赖 → 跑测试 → 改代码 → 反复迭代
4. Agent 提交一个 draft PR，附上它做了什么的摘要
5. 你 review PR：打回重做（留 comment，Agent 继续迭代）或合并
```

这套流程看起来简单，真正跑起来你会发现：**瓶颈迅速从"模型质量"转移到"工程纪律"**。当你同时派 3-5 个后台任务时，决定成败的是这些：

- **Branch / Worktree 纪律**：每个 Agent 必须有自己独立的分支或 worktree（Git 的并行工作区机制）。两个 Agent 在同一个工作区改同一批文件，结果必然是互相覆盖。这也是 Conductor 这类本地多 Agent 工具的核心设计——每个 Agent 住在一个独立的 Git worktree 里，物理隔离
- **任务切分的正交性**：派出去的 5 个任务如果都要改 `package.json` 或同一个核心文件，合并时就是冲突地狱。切任务时按"文件所有权"切，而不是按"功能"切
- **合并顺序**：先合影响面大的 PR，再合小的；每合一个，让其余 Agent rebase 后再继续
- **验收自动化**：Agent 回来的 PR 必须过 CI（测试 + lint + 类型检查）才轮到人看。没有 CI 兜底，并行 Agent 会把 review 负担放大到人无法承受的程度

> 💡 **类比**：管理并行 Agent 和管理一个分布式团队一模一样。新经理常犯的错误是以为"人多活就快"，结果 5 个人改同一个文件、天天解冲突。老司机知道：先划好各自的模块边界（文件所有权），定好合并节奏，效率才上得来。模型再强，也替代不了这个"工程管理"层。

---

## Agent Teams：多 Agent 并行的产品化

"一个 lead 带多个 worker 并行干活"这个模式（[4.6](./multi-agent) 讲过原理），2026 年被各家做成了正式产品：

### Claude Code Agent Teams

Anthropic 官方文档（截至 2026-07 仍是实验特性，需设置 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 开启）：一个 Claude Code 主会话作为 **team lead（领队）**，派生多个 **teammate（队员）**——每个队员是一个独立的 Claude Code 实例，有自己的上下文窗口。与 [4.6](./multi-agent) 讲的 subagent 的区别在于：

- Subagent 只能向主 Agent 汇报结果，队员之间不能互相说话
- Agent Teams 的队员共享一个**任务列表（task list）**，可以自己认领任务，还能通过 mailbox 机制直接互相通信——比如前端队员直接问后端队员接口约定

官方文档自己也强调代价：token 消耗随队员数线性增长，协调开销随人数上升，官方建议从 3-5 个队员起步，并且**避免两个队员改同一个文件**。

### Google Antigravity 2.0

Google 在 I/O 2026（2026-05-19）发布了 Antigravity 2.0（官方博客确认其从 IDE 重构为独立的 agent 优先桌面应用）。据官方介绍和多家第三方报道，其核心是**运行时动态编排 subagent**：一个主编排 Agent 把任务拆小，动态派生专职 subagent（前端、API、测试各一个）并行执行，再汇总结果。2.0 还把工作区从单仓库扩展到跨多代码库的 Project。

### Anthropic Managed Agents API

如果你想把"云端异步 Agent"能力嵌进自己的产品，而不是用现成的 coding 工具——这就是 Managed Agents 的定位。据 Anthropic 官方 Release Notes：

- **2026-04-08**：Claude Managed Agents 进入 public beta——全托管的 Agent 运行时，自带安全沙箱、内置工具和事件流，你通过 API 创建 agent、跑 session，基础设施由 Anthropic 管
- **2026-05-06**：多 Agent 编排（multiagent orchestration）在同一 beta header（`managed-agents-2026-04-01`）下进入 public beta——相当于把 [4.12](./workflow-orchestration) 讲的编排能力也托管化了
- 计费方式为 API token 费率外加按 session 时长计的运行时费用

换句话说，Anthropic 把 Claude Code 背后的那套 harness（沙箱、状态管理、错误恢复）抽出来变成了 API 产品——你在 [4.13](./code-sandbox) 学到的自建沙箱方案，现在有了"直接买"的替代项。

---

## Advisor 模式：贵模型当顾问，便宜模型干活

并行和多实例会把成本问题推到台前，于是一个重要的省钱模式在 2026 年产品化了：**Advisor（顾问）模式**——让一个便宜快速的模型（executor，执行者）跑完整的任务循环，只在遇到拿不准的决策点时，调用一个贵模型（advisor，顾问）要一段几百 token 的建议，然后继续干。

Anthropic 在 2026-04-09 把 advisor tool 上线了 public beta（官方 Release Notes）：在 Messages API 里把 advisor 声明成一个工具，执行模型自己决定何时调用它，顾问只输出一段战略建议，绝大部分 token 都按执行模型的便宜费率计费。

> 💡 **类比**：这就是医院里的"住院医 + 主任医师"制度。住院医（便宜模型）处理全部日常诊疗，遇到拿不准的病例才请主任医师（贵模型）会诊。主任医师的号很贵，但一天只需要看几个疑难病例；全让主任医师坐门诊，成本谁也扛不住。

它和 [5.21 LLM Router](/ch5-deep-dives/llm-router) 是**互补关系，不是替代关系**：

- **LLM Router 是请求级路由**：请求进来，先决定整个请求发给谁——简单请求全程用便宜模型
- **Advisor 是任务内升级**：任务已经在便宜模型手里跑了，中途遇到难点才临时咨询贵模型

一个成熟的成本方案通常两者都用：Router 挡掉根本不用贵模型的请求，Advisor 兜住"便宜模型跑到一半卡住"的情况。

---

## 成本与治理：并行 Agent 会成倍放大账单

前面每一节都在说"并行提效"，这里是账单的另一面：

- **并行是乘法**：1 个 Agent 跑一个长任务烧 X，5 个并行就是 5X 起步——再加上 Agent Teams 的队员间通信、lead 的协调开销，实际可能更多。官方文档明确警告 Agent Teams 的 token 消耗"显著高于"单会话
- **订阅制与自动化用量的矛盾**：包月订阅假设的是"人坐在终端前用"的强度；当 Agent 可以 7×24 小时在云端并行跑后台任务时，同一笔订阅费对应的算力消耗可以放大几个数量级。这个矛盾在 2026 年 6 月爆发了一次：据 The New Stack、DevOps.com 等多家媒体报道，Anthropic 原定于 2026-06-15 把 Agent SDK 的自动化用量从订阅额度中剥离、改为按 API token 费率单独计费，因开发者社区强烈反弹，在生效当天宣布暂缓，订阅额度暂维持不变
- **治理建议**：
  - 给每个云端任务设预算上限（token 或金额），超了自动停
  - 并行任务数量设上限，先把 1 个后台任务的 ROI 跑正，再加并行度
  - 把"派出去的任务类型"收敛到验收可自动化的（有测试、有 lint），减少人 review 的隐性成本

> ⚠️ **常见误解**："订阅是包月的，派后台任务不额外花钱。"额度是真的，但不是无限的——订阅有周用量上限，重度自动化会很快顶到 cap，剩下的时间你和 Agent 都只能干等。把订阅额度当成"共享带宽"来规划，而不是"免费自助餐"。

---

## 🛠️ 实战练习：用 Git Worktree 模拟双 Agent 并行开发

即使不订阅任何云端 Agent 产品，你也可以在本地体验"并行 Agent 的工程纪律"——用两个 Claude Code（或任何 coding agent）会话 + Git worktree，模拟双轨并行：

**具体步骤**：

1. 任选一个你的项目仓库，开出两个互相独立的真实任务（例如：任务 A 给某个模块补单元测试，任务 B 更新 README 和文档）
2. 为每个任务创建独立 worktree：

```bash
git worktree add ../project-task-a -b task/add-tests
git worktree add ../project-task-b -b task/update-docs
```

3. 在两个终端里分别 `cd` 进两个 worktree，各开一个 Agent 会话，各自完成任务并提交
4. 回到主仓库，依次合并两个分支：`git merge task/add-tests && git merge task/update-docs`
5. 观察：因为任务正交（改了不同文件），合并应该零冲突

**期望结果**：两个分支都干净合并，无需手工解冲突。你验证了"任务按文件所有权切分 → 并行无冲突"这个核心纪律。

**进阶挑战**：故意制造不正交的任务——让两个 Agent 都修改同一个文件（比如都往 `package.json` 加依赖），然后合并，手工解一次冲突。体会"任务切分不当"的代价，再想清楚下次派任务时该怎么切。

---

## 📌 关键结论

1. Coding Agent 分化为三种执行模型：本地终端人审式、IDE 内嵌式、云端异步沙箱；2026 年的主流实践是双轨制——本地做聚焦重构，云端做并行后台任务
2. Background agent 的标准流是"派 GitHub issue → 收 draft PR"；并行之后，瓶颈从模型质量转移到 branch/worktree 纪律、任务正交切分和合并冲突管理
3. 多 Agent 并行已产品化：Claude Code Agent Teams（实验性，lead + 可互相通信的 teammates）、Antigravity 2.0 的动态 subagent 编排、Managed Agents API（2026-04 public beta）把整套 harness 变成了可购买的云服务
4. Advisor 模式（贵模型做顾问、便宜模型做执行）与 LLM Router（请求级路由）互补，是控制 agent 成本的两个基本件
5. 并行 agent 成倍放大账单，订阅制与自动化用量的矛盾已经开始爆发（2026-06 的 Agent SDK 计费风波）；给任务设预算上限、把 ROI 跑正再加并行度

---

下一节：[4.25 Agent 系统的六条不变量](./agent-invariants)
