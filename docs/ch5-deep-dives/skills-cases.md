# 5.12 Skill·案例集

三个能直接抄的 Skill 设计。每个给：**场景 → SKILL.md 骨架 → 关键设计 → 落地要点**。

---

## 案例一：团队代码规范检查

**场景**：让 Claude Code 在写/改代码时，自动遵守你们团队的规范（命名、错误处理、禁用项），不用每次在对话里重复交代。

**结构与骨架**

```
code-standards/
├── SKILL.md
└── reference/
    ├── frontend.md     # 前端规范细则
    └── backend.md      # 后端规范细则
```

```markdown
---
name: code-standards
description: 检查并应用团队代码规范。当用户要写代码、改代码、做 code review，或问"符不符合规范"时使用。
allowed-tools: Read, Grep, Edit
---

# 团队代码规范

写或审查代码时遵守以下规范。先判断是前端还是后端，再读对应的 reference 文件：
- 前端任务 → 读 reference/frontend.md
- 后端任务 → 读 reference/backend.md

通用红线：
- 禁止 any 类型；函数必须有错误处理
- 不改 legacy/ 目录
审查时逐条对照，列出违规点和修法。
```

**关键设计**
- 把又多又长的规范细则拆到 `reference/`，**按前/后端按需加载**（渐进式披露，[5.10](./skills-intro)）——别全塞正文
- `description` 覆盖"写代码/改代码/review/问规范"多种触发场景
- `allowed-tools` 给 `Read/Grep/Edit` 即可，不需要 Bash
- 和 [4.4 CLAUDE.md](/ch4-agent-mcp/claude-code) 的区别：CLAUDE.md 是"这个项目"的常驻背景；Skill 可跨项目复用、按需加载、能拆细则

---

## 案例二：部署前检查清单

**场景**：每次上线前要跑一套固定检查（lint、测试、环境变量、安全），固化成一个 Skill，一句"准备部署"就触发。

**骨架**

```markdown
---
name: deploy-checklist
description: 部署前检查。当用户说"准备部署""上线前检查""deploy check"时使用。
allowed-tools: Bash, Read
---

# 部署前检查清单

按顺序执行，任一步失败就停下报告，不要跳过：
1. 跑 `pnpm lint`，有错先修
2. 跑 `pnpm test`，确认全绿
3. 检查 .env.example 与实际所需环境变量是否一致
4. 跑 `pnpm audit` 看依赖漏洞
5. grep 检查有没有硬编码密钥
6. 输出一份检查结果摘要，列出发现的问题
```

**关键设计**
- 这是**确定的流程**，Skill 把它标准化、可一键触发（比每次口述可靠）
- "失败就停、不要跳过"是关键约束（呼应 [2.4 防失控](/ch2-build-products/agent-failure)）
- 注意：纯固定、完全不需要 AI 判断的流程，也可以直接写脚本（[5.8](./mcp-decision)）；这里用 Skill 是因为还需要 AI **理解输出、给修复建议**

---

## 案例三：API 文档生成

**场景**：从代码生成符合团队格式的 API 文档，带统一模板，还能跑脚本提取路由。

**结构**

```
api-docs/
├── SKILL.md
├── reference/
│   └── doc-template.md     # 文档模板
└── scripts/
    └── extract-routes.sh   # 提取路由定义
```

```markdown
---
name: api-docs
description: 生成 API 接口文档。当用户说"生成 API 文档""给接口写文档""更新 API doc"时使用。
allowed-tools: Bash, Read, Write
---

# API 文档生成

1. 运行 scripts/extract-routes.sh 提取所有路由（方法、路径、handler）。
2. 读取每个 handler 的代码，理解参数和返回。
3. 按 reference/doc-template.md 的格式为每个接口生成文档。
4. 写入 docs/api.md。
不确定的参数标注"待确认"，不要编造。
```

**关键设计**
- **脚本提取路由**（确定性的活给脚本，[4.8 补偿性代码](/ch4-agent-mcp/harness-engineering)），AI 负责"读代码 + 按模板写人话"
- 模板拆到 reference，保证团队文档格式统一
- "不确定标注待确认，不要编造"——防 [幻觉](/ch5-deep-dives/rag-eval)

---

## 三个案例的共性

| 维度 | 经验 |
|-----|------|
| description | 都覆盖**用户的多种真实说法**，确保自动触发 |
| 渐进披露 | 长规范/模板都拆到 `reference/`，正文只放主干 |
| 脚本 | 确定性的取数/提取交给 `scripts/`，AI 只做判断和表达 |
| 权限 | `allowed-tools` 按需最小化 |
| 边界 | 都写了"不要编造/失败就停"这类约束 |

> 💡 选 Skill 还是别的？再回顾 [5.8](./mcp-decision)：这三个都是"教 AI 怎么做某类任务"（流程+规范+模板+脚本），所以是 Skill；如果是"连数据库/调接口"那是 MCP。

---

## 🛠️ 实战练习：把你的一段"口头规范"变成 Skill

回想你最近**反复对 AI 交代的同一段要求**（比如"代码要加类型、提交信息按这个格式、别动那个目录"）：

1. 把它写成一个 `code-standards` 风格的 Skill
2. 长的部分拆到 reference，正文留主干
3. description 写上你平时怎么开口要求的
4. 在项目里触发它，验证不用再每次口述规范

**进阶挑战**：给它配一个脚本做客观检查（如 grep 禁用项），让 Skill 既"懂规范"又能"自动查"。

---

## 📌 关键结论

1. 代码规范 Skill：规范细则拆 reference 按需加载，`allowed-tools` 限 Read/Grep/Edit，跨项目复用
2. 部署清单 Skill：把固定流程标准化、一句话触发，"失败就停"是关键约束
3. API 文档 Skill：脚本提取 + AI 按模板写人话 + "不确定标注待确认"防幻觉
4. 通用套路：description 覆盖真实说法、长资料拆 reference、确定性交脚本、最小权限、写清边界

---

Skill 开发系列完成 🎉 下一节进入本章最后一块——模型微调实战：[5.13 微调·全流程与数据准备](./finetuning-workflow)
