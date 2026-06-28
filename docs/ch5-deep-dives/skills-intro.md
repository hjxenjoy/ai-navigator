# 5.10 Skill·究竟是什么

[4.5](/ch4-agent-mcp/skill-harness) 把 Skill 粗略当成"斜杠命令"。但 2025 年底 Anthropic 把 **Agent Skills** 做成了开放标准（已被 Claude、Codex、Gemini CLI、Cursor 等 20 多个平台采纳），它比斜杠命令强大得多。这一节讲清楚 Skill 真正是什么、为什么这么设计。

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
| `~/.claude/skills/<name>/` | 个人，所有项目可用 |
| 项目内 `.claude/skills/<name>/` | 跟项目走，可提交 Git 团队共享 |
| 插件（plugin）/ 内置 | Claude Code 自带一批（如 `/code-review`），也可装第三方 |

---

## Skill vs 斜杠命令 vs MCP

| | 是什么 | 给 AI 的是 |
|--|-------|----------|
| **Skill** | 文件夹（SKILL.md+资源+脚本），按需自动加载 | **知识/流程**（怎么做某类任务），可带脚本 |
| **自定义斜杠命令** | 单个 prompt 模板，手动 `/触发` | 一句话提示，较轻量 |
| **MCP** | 标准协议服务 | **外部能力**（连真实系统） |

> 💡 一句话区分（详见 [5.8 选型决策](./mcp-decision)）：要**新能力**（连数据库/接口）用 MCP；要教 AI **怎么做事**（流程/规范/带脚本的专项手册）用 Skill；只是想固化**一句提示**用斜杠命令。

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
4. `description` 是触发条件，决定 AI 何时自动用它——务必写清"做什么+什么时候用"
5. 要能力用 MCP，要流程/知识用 Skill，要一句提示用斜杠命令

---

下一节：[5.11 Skill·手把手开发与打包](./skills-build)
