# 5.10 Skill·究竟是什么

> 🕐 内容截至 2026-07

[4.5](/ch4-agent-mcp/skill-harness) 把 Skill 粗略当成"斜杠命令"。但 2025 年 12 月，Anthropic 把 **Agent Skills** 作为开放标准发布（规范站 [agentskills.io](https://agentskills.io)），半年内已被 Claude、Codex、Gemini CLI、Cursor 等 30 多个平台采纳，它比斜杠命令强大得多。这一节讲清楚 Skill 真正是什么、为什么这么设计。

## Skill 的本质：一个文件夹

一个 Skill 就是**一个文件夹**，里面有一个 `SKILL.md`，外加可选的脚本和资源文件：

```
my-skill/
├── SKILL.md          # 必需：元数据 + 指令
├── reference/        # 可选：详细参考资料（用到才加载）
│   └── examples.md
└── scripts/          # 可选：可执行脚本（任何语言）
    └── helper.py
```

`SKILL.md` 开头是 YAML frontmatter，下面是 Markdown 正文：

```markdown
---
name: weekly-report
description: 生成团队周报。当用户要求"写周报""总结这周做了什么"时使用。
---

# 周报生成

按以下步骤把本周工作整理成标准周报：
1. ...
2. ...
```

**必填只有两个字段**：
- `name`：小写+连字符，<64 字符，**必须和文件夹名一致**
- `description`：<1024 字符，要写清**做什么 + 什么时候用**（这条极其关键，见下）

> 💡 **Skill = 给 AI 一份"专项操作手册"**：把"做某类任务的标准流程、规范、知识、甚至工具脚本"打包，需要时 AI 自己翻出来照着做。

---

## 核心设计：渐进式披露（Progressive Disclosure）

这是 Skill 最聪明的地方，也是它能"装很多本事却不占满上下文"的原因。

> 📚 **比喻**：Skill 像一本带目录的员工手册。AI 不会一上来把整本手册背下来（那会撑爆 [上下文](/ch4-agent-mcp/context-engineering)），而是：
> - **平时只记住目录**（每条 Skill 的 name + description，约 100 token）
> - **接到相关任务才翻开那一章**（加载完整 SKILL.md 正文）
> - **需要细节才看附录**（按需读 reference 文件）

```
三层加载：
① 启动时：只加载所有 Skill 的 name + description（~100 token/个）
            → AI 心里有数"有哪些本事、啥时候用"
② 激活时：任务匹配上了，才加载完整 SKILL.md 正文（建议 <5000 token）
③ 按需时：正文里指向的 reference 文件 / 脚本，真用到才加载/执行
```

这就是为什么你可以装几十个 Skill 而不拖慢、不占爆上下文——**绝大多数时候它们只是"目录里的一行"**。

---

## description 决定"何时被自动触发"

⚠️ 这是新手最容易忽略的点：**AI 靠 `description` 判断要不要用这个 Skill**。所以 description 不是写给人看的简介，而是写给 AI 的**触发条件**。

```yaml
# ❌ 太笼统，AI 不知道啥时候该用
description: 一个处理文档的工具

# ✅ 说清做什么 + 什么时候用（含用户可能的说法）
description: 把 Markdown 文档转成带格式的 Word。当用户要求"导出 Word""生成 .docx""把文档转成 Word 格式"时使用。
```

写好 description = Skill 能在对的时机被自动唤起；写砸了 = 装了也不触发。

---

## Skill 放在哪

| 位置 | 作用范围 |
|-----|---------|
| `~/.claude/skills/<name>/` 或 `~/.agents/skills/<name>/` | 个人，所有项目可用 |
| 项目内 `.claude/skills/<name>/` 或 `.agents/skills/<name>/` | 跟项目走，可提交 Git 团队共享 |
| 插件（plugin）/ 内置 | Claude Code 自带一批（如 `/code-review`），也可装第三方 |

其中 `.agents/skills/` 是**跨客户端目录约定**（[agentskills.io 客户端实现指南](https://agentskills.io/client-implementation/adding-skills-support)推荐所有兼容客户端都扫描它）：写一份 Skill，Claude Code、Codex、Cursor 都能看见，不用为每个客户端各装一遍。

综合各客户端实现，Skill 的来源大致分四级：**Enterprise**（企业管理员统一下发）→ **Personal**（个人目录）→ **Project**（项目目录，随 Git 仓库走）→ **Plugins**（随插件包安装）。同名 Skill 冲突时的通行规则是**项目级覆盖个人级**、企业级优先最高；项目级 Skill 来自可能不可信的仓库，好客户端会先问你是否信任该项目再加载。

> ⚠️ **常见误解**：以为 Skill 只能放在 `.claude/` 下、是 Claude 专属。`.agents/skills/` 才是跨客户端的"普通话"目录——新写的 Skill 优先放这里，可移植性最好。

---

## Skill vs 斜杠命令 vs MCP

| | 是什么 | 给 AI 的是 |
|--|-------|----------|
| **Skill** | 文件夹（SKILL.md+资源+脚本），按需自动加载 | **知识/流程**（怎么做某类任务），可带脚本 |
| **自定义斜杠命令** | 单个 prompt 模板，手动 `/触发` | 一句话提示，较轻量 |
| **MCP** | 标准协议服务 | **外部能力**（连真实系统） |

> 💡 一句话区分（详见 [5.8 选型决策](./mcp-decision)）：要**新能力**（连数据库/接口）用 MCP；要教 AI **怎么做事**（流程/规范/带脚本的专项手册）用 Skill；只是想固化**一句提示**用斜杠命令。

### Skills vs MCP：真实的 token 效率之争

虽然 MCP 已成连接标准（2025 年 12 月捐给 Linux 基金会旗下 Agentic AI Foundation），但"MCP 工具定义太占上下文"的争议是真实的，2025 年底到 2026 年有几件标志性的事：

- **Armin Ronacher**（Flask 作者）在《[Skills vs Dynamic MCP Loadouts](https://lucumr.pocoo.org/)》（2025-12）里公开从 MCP 转向 Skills：MCP 即使做延迟工具加载，也要 LLM API 侧大量工程配合，而 Skill 只是"一小段能力摘要 + 手册文件路径"，不往上下文塞任何工具定义，工具还是 Agent 本来就有的 bash——实测反而更高效稳定。
- **Perplexity CTO Denis Yarats** 在 2026 年 3 月的 Ask 2026 开发者大会上宣布**内部弃用 MCP**，转向 REST API + CLI——据第三方报道，主要理由是 MCP 工具定义带来的上下文开销（有报道称达 72%）。
- 社区里"MCP is dead, long live the CLI"一类文章也随之出现。

> 💡 **怎么看这场争论**：两边争的是**怎么给 Agent 递能力最省 token**。Skills/CLI 派说"模型本来就会用命令行，给本手册就行"；MCP 派说"结构化协议有类型、有权限、可审计"。务实结论：**流程和知识用 Skill，真正的外部系统接入（尤其需要权限和审计的企业场景）仍用 MCP**——这和上面的选型表不矛盾。MCP 成了标准 ≠ 没有争议，选型时把"上下文开销"算进成本。

---

## 🛠️ 实战练习：读懂一个真实 Skill

Claude Code 自带一批 Skill（如 `/code-review`）。找一个开源 Skill 仓库（搜 "awesome claude skills"），挑一个：

1. 打开它的 `SKILL.md`，看 frontmatter 的 `description` 是怎么写触发条件的
2. 看正文有多长（是不是控制在几千 token 内）
3. 看它有没有 `reference/` 或 `scripts/`，哪些是"按需加载"的

**期望结果**：你能看懂"渐进式披露"在真实 Skill 里长什么样，为后面自己写做准备。

---

## 📌 关键结论

1. Skill 是一个文件夹：SKILL.md（必需）+ 可选的参考资料和脚本，是给 AI 的"专项操作手册"
2. frontmatter 必填 `name`（与文件夹同名）和 `description`
3. 渐进式披露三层：平时只记目录（name+desc）→ 激活才读正文 → 按需才看附录/跑脚本，所以能装很多而不占爆上下文
4. 2025 年 12 月 Agent Skills 成为开放标准（agentskills.io），30+ 平台采纳；`.agents/skills/` 是跨客户端通用目录，来源分 Enterprise → Personal → Project → Plugins 四级，项目级覆盖个人级
5. `description` 是触发条件，决定 AI 何时自动用它——务必写清"做什么+什么时候用"
6. 要能力用 MCP，要流程/知识用 Skill，要一句提示用斜杠命令；MCP 虽是标准，但"工具定义占上下文"的争议真实存在（Armin Ronacher、Perplexity 都已公开转向 Skills/CLI）

---

下一节：[5.11 Skill·手把手开发与打包](./skills-build)
