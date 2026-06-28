# 4.5 Skill 与 Harness 机制

## Skill 是什么

Skill（技能）是 Claude Code 的可插拔能力扩展。你输入 `/frontend-design`、`/docx`、`/code-review` 这些，背后就是 Skill 在工作。

**Skill 的本质**：一段 Markdown 文件，包含了触发条件、执行指令和上下文信息，当你调用斜杠命令时，这段内容被注入到 AI 的上下文里，指导它以特定方式处理任务。

> 📖 本节是 Skill 的快速认知。Anthropic 后来把 **Agent Skills** 做成了开放标准（文件夹 + `SKILL.md` + 可捆绑脚本 + 渐进式披露），比"斜杠命令"强大得多。完整、最新的讲解和手把手开发，见 [5.10–5.12 Skill 深入](/ch5-deep-dives/skills-intro)。

---

## Skill 的工作原理

```
用户输入：/frontend-design

                    ↓

系统找到对应的 Skill 文件
（包含了"如何做前端设计"的详细指令）

                    ↓

把 Skill 内容注入到 AI 的上下文

                    ↓

AI 按照 Skill 的指引执行任务
```

---

## 自定义 Skill

你可以在 `.claude/commands/` 里创建自己的 Skill：

```markdown
<!-- .claude/commands/deploy-check.md -->
# 部署前检查清单

在部署之前，按顺序执行以下检查：

1. **代码检查**
   - 运行 `pnpm lint` 并修复所有错误
   - 确认没有 TypeScript 错误

2. **测试**
   - 运行 `pnpm test` 并确认全部通过
   - 检查测试覆盖率是否达标

3. **环境变量**
   - 确认所有必要的环境变量都已配置
   - 检查 `.env.example` 是否与实际需要的变量一致

4. **安全检查**
   - 运行 `pnpm audit` 检查依赖漏洞
   - 确认没有硬编码的 API 密钥

5. **输出报告**
   完成后输出一份检查结果摘要，列出发现的问题。
```

使用：`/deploy-check`

---

## Harness 是什么

> 📖 本节是 Harness 的**快速认知**。它为什么决定 Agent 一大半表现、由哪些零件构成、怎么自己设计——见 [4.8 Agent = Model + Harness](./harness-engineering) 和 [4.9 上下文工程](./context-engineering) 的深入讲解。

Harness 是运行 Claude Code Agent 的底层框架。你不直接和 Harness 交互，但理解它能帮你理解 Claude Code 的行为。

**Harness 负责：**
- 管理 AI 和工具之间的通信循环（Agentic Loop）
- 处理工具调用的权限检查
- 管理 Subagent 的生命周期
- 处理 Hook 的触发和执行
- 上下文的压缩和管理

> 💡 **类比**：如果把 Claude（AI 模型）比作一个工人，那 Harness 是工厂的管理系统——负责分配任务、管理工具使用权限、记录工作日志。

---

## Harness 的工作流程

```
用户输入 → Harness 接收
         ↓
    检查权限
         ↓
    发送给 Claude
         ↓
  Claude 决定用什么工具
         ↓
    Harness 检查工具权限
    ├── 允许 → 执行工具
    └── 拒绝 → 询问用户确认
         ↓
    把工具结果返回给 Claude
         ↓
    触发相应的 Hooks
         ↓
    输出最终结果
```

---

## 为什么理解 Harness 有用

当你发现 Claude Code 的行为"不正常"时，知道 Harness 的存在能帮你定位问题：

- **AI 的决策**：Claude 决定做什么、怎么做
- **Harness 的限制**：权限不够导致工具调用被拒绝
- **MCP 问题**：外部 Server 没有启动或返回错误
- **Hook 问题**：Hook 脚本执行失败影响了后续流程

---

## 📌 关键结论

1. Skill 是预定义的指令集，让 Claude Code 能以特定方式处理特定任务
2. 自定义 Skill 就是在 `.claude/commands/` 里创建 Markdown 文件
3. Harness 是 Claude Code 的运行框架，管理 AI 和工具之间的一切
4. 出现问题时，区分是"AI 的决策问题"还是"Harness 的配置/权限问题"

---

下一节：[4.6 多 Agent 协作](./multi-agent)
