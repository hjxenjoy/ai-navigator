# 5.11 Skill·手把手开发与打包

这一节从零做一个真实可用的 Skill，覆盖：写 SKILL.md、用渐进式披露拆分内容、捆绑可执行脚本、限制工具权限，最后打包分享。

## 目标：做一个"周报生成"Skill

需求：让 AI 能把本周的 git 提交，整理成团队统一格式的周报。我们让它**带一个脚本**（拉取本周提交）和**一个模板**（周报格式），演示 Skill 的完整能力。

**最终结构：**

```
weekly-report/
├── SKILL.md            # 元数据 + 主流程
├── reference/
│   └── template.md     # 周报模板（按需加载）
└── scripts/
    └── collect.sh      # 拉取本周 git 提交
```

放在 `~/.claude/skills/weekly-report/`（个人用）或项目 `.claude/skills/weekly-report/`（团队共享）。

---

## 第一步：写 SKILL.md

```markdown
---
name: weekly-report
description: 生成团队周报。当用户说"写周报""总结这周做了什么""generate weekly report"时使用。
allowed-tools: Bash, Read
---

# 周报生成

把本周工作整理成团队标准周报。

## 步骤
1. 运行 `scripts/collect.sh` 获取本周的 git 提交记录。
2. 按类型归类提交（功能 / 修复 / 重构 / 文档）。
3. 读取 `reference/template.md` 作为输出格式。
4. 用模板生成周报，语言简洁，面向非技术同事也能看懂。
5. 末尾附"下周计划"留空，让用户补充。

## 注意
- 只总结实际改动，不要编造没做的事。
- 一条提交对应一句人话，不要直接贴 commit message。
```

要点：
- `description` 写清触发场景（[5.10](./skills-intro)），含用户可能的几种说法
- `allowed-tools`（**仅 Claude Code CLI 支持**）：限制这个 Skill 只能用 `Bash` 和 `Read`，缩小权限面
- 正文是**主流程**，简短；细节（模板）拆到 reference 文件里按需加载

---

## 第二步：拆分内容（渐进式披露）

周报模板可能很长，不该塞进 SKILL.md 正文（会一直占激活后的上下文）。放进 `reference/template.md`，正文里"用到时才读它"：

```markdown
<!-- reference/template.md -->
# 周报 · {{姓名}} · {{日期}}

## 本周完成
- {{按类型分组的工作项}}

## 关键进展 / 风险
- {{值得同步的事}}

## 下周计划
- {{下周要做的事}}
```

> 💡 这就是渐进式披露的实操：**正文只放"主干流程"，又长又细的资料拆成 reference 文件**，AI 真要用了才加载。SKILL.md 正文建议控制在几千 token 内。

---

## 第三步：捆绑脚本（Skill 的杀手锏）

Skill 能**捆绑并运行任意语言的脚本**——这让它做到纯 prompt 做不到的事（精确计算、调命令、处理文件）。这也呼应 [4.8 补偿性代码](/ch4-agent-mcp/harness-engineering)：确定性的活交给脚本，别让模型瞎算。

```bash
# scripts/collect.sh —— 拉取本周提交
#!/usr/bin/env bash
since=$(date -v-mon +%Y-%m-%d 2>/dev/null || date -d "last monday" +%Y-%m-%d)
git log --since="$since" --pretty=format:"%h %s (%an)"
```

SKILL.md 正文第 1 步让 AI `Bash` 运行它，AI 就拿到真实、准确的提交列表，而不是凭记忆编。

---

## 第四步：本地测试

```bash
mkdir -p ~/.claude/skills/weekly-report/{reference,scripts}
# 放入 SKILL.md / template.md / collect.sh
```

重开 Claude Code，在一个有 git 历史的项目里说"帮我写本周周报"，观察：
- Skill 是否被**自动触发**（取决于 description 写得好不好）
- 它是否运行了 `collect.sh`、读了 `template.md`
- 输出是否符合模板

> ⚠️ 没触发？十有八九是 `description` 没写清触发场景。回去把用户的真实说法补进去。

---

## 第五步：打包与分享

Skill 就是个文件夹，分享方式很自然：

- **团队共享**：放进项目的 `.claude/skills/`，提交 Git，全员 clone 即得
- **跨项目复用**：放 `~/.claude/skills/`
- **对外分发**：打包成 zip，或做成 Claude Code 插件（plugin）发布
- 因为是开放标准，同一个 Skill 在 Codex、Cursor、Gemini CLI 等也能用

---

## 怎么写出"好用"的 Skill

| 原则 | 说明 |
|-----|------|
| description 写触发条件 | 含用户的真实说法，决定能不能被自动唤起 |
| 正文只放主干 | 长资料拆 reference，控制正文 token |
| 确定性交给脚本 | 计算/取数/调命令用脚本，别让模型估 |
| 最小权限 | `allowed-tools` 只给必要的工具 |
| 步骤清晰、可复现 | 像写给新人的 SOP，一步步可照做 |
| 加"不要做什么" | 明确边界（如"不要编造没做的事"） |

---

## 🛠️ 实战练习：做你自己的第一个 Skill

挑一件你**重复做、且有固定套路**的事（生成 commit message、写 PR 描述、整理会议纪要、清洗某种数据）：

1. 建 `~/.claude/skills/<你的skill名>/SKILL.md`
2. frontmatter 把 `description` 的触发场景写足（你平时怎么开口的）
3. 正文写清步骤；长模板/规范拆到 `reference/`
4. 如果涉及取数/计算，写个 `scripts/` 脚本让它调
5. 重开 Claude Code，用你平时的说法触发它，调到能自动唤起为止

**进阶挑战**：给这个 Skill 加 `allowed-tools` 限权，并把它放进某个项目的 `.claude/skills/` 提交，让队友也能用。

---

## 📌 关键结论

1. Skill 开发四件套：SKILL.md（元数据+主流程）、reference（按需资料）、scripts（可执行）、allowed-tools（限权）
2. 渐进式披露落地：正文只放主干，长资料拆 reference，控制正文 token
3. 捆绑脚本是 Skill 的杀手锏：确定性的活交给脚本，比纯 prompt 可靠
4. description 决定能否被自动触发，必须含用户真实说法
5. 分享即复制文件夹：项目 `.claude/skills` 团队共享、`~/.claude/skills` 跨项目、zip/插件对外分发

---

下一节：[5.12 Skill·案例集](./skills-cases)
