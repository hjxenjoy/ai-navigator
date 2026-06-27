# 4.4 Claude Code 深度使用

你已经在用 Claude Code，但可能还没完全发挥它的能力。这一节系统整理深度使用的方法。

## CLAUDE.md：项目级别的记忆

在项目根目录放一个 `CLAUDE.md` 文件，Claude Code 每次启动时都会读取它。这是给 AI 的"项目说明书"。

**好的 CLAUDE.md 应该包含：**

```markdown
# 项目名称

## 项目概述
这是一个...，核心功能是...

## 技术栈
- 前端：React + TypeScript + Tailwind
- 后端：Node.js + Express + PostgreSQL
- 部署：Vercel + Railway

## 代码规范
- 使用 TypeScript，禁止 any 类型
- 函数命名用驼峰，文件命名用短横线
- 组件文件放在 src/components/

## 常用命令
- 启动开发服务器：pnpm dev
- 运行测试：pnpm test
- 数据库迁移：pnpm db:migrate

## 注意事项
- 不要修改 legacy/ 目录下的文件（有历史债务）
- 所有 API 调用都要加错误处理
- 数据库操作一定要在事务里
```

---

## Hooks：自动化触发操作

Claude Code 支持配置 Hooks，在特定事件发生时自动执行命令。

```json
// .claude/settings.json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "prettier --write $CLAUDE_FILE_PATHS"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node scripts/notify-complete.js"
          }
        ]
      }
    ]
  }
}
```

**常用 Hook 时机：**
- `PostToolUse`：每次工具调用后
- `Stop`：Claude 完成任务后
- `PreToolUse`：工具调用前（可以拦截）

---

## Slash Commands（斜杠命令）：自定义工作流

在 `.claude/commands/` 目录里放 Markdown 文件，就能创建自定义斜杠命令。

```bash
mkdir -p .claude/commands
```

```markdown
<!-- .claude/commands/pr-review.md -->
请帮我做一个全面的 PR 审查：

1. 检查代码逻辑是否正确
2. 检查是否有明显的性能问题
3. 检查错误处理是否完整
4. 检查代码风格是否符合项目规范
5. 给出改进建议

当前的 diff：
$CURRENT_GIT_DIFF
```

使用时：`/pr-review`

---

## Subagent：委托子任务

在 Claude Code 里，你可以让 AI 把子任务委派给 Subagent 并行处理：

```
你：帮我优化这个项目，同时做：
    1. 代码质量检查
    2. 性能分析
    3. 安全扫描

Claude：好的，我会启动三个 Subagent 并行处理...
```

Subagent 会在独立的上下文里执行任务，完成后汇报结果给主 Agent。

---

## Worktree：隔离的代码修改环境

Claude Code 的 Worktree 功能利用了 Git 的 worktree 机制，让 Agent 在一个隔离的目录里做修改，不影响你当前的工作区。

```
当 Agent 在 Worktree 里工作时：
  ├── 你的主工作区保持不变
  ├── Agent 在独立目录做修改
  ├── 修改完成后你可以审查
  └── 决定合并还是丢弃
```

特别适合：让 Agent 做比较大的重构，你先看结果再决定要不要。

---

## Permission 配置：控制 AI 能做什么

```json
// .claude/settings.json
{
  "permissions": {
    "allow": [
      "Bash(npm:*)",          // 允许所有 npm 命令
      "Bash(git status)",     // 允许 git status
      "Read(**)",             // 允许读所有文件
      "Edit(src/**)"          // 只允许编辑 src 目录
    ],
    "deny": [
      "Bash(rm:*)",           // 禁止 rm 命令
      "Bash(git push:*)"      // 禁止 push
    ]
  }
}
```

---

## 📌 关键结论

1. `CLAUDE.md` 是最重要的配置，给 AI 项目上下文让它更准确
2. Hooks 能让 Claude Code 完成任务后自动触发格式化、测试等操作
3. 自定义斜杠命令可以固化你的工作流，一行命令触发复杂流程
4. Permission 配置控制 AI 的操作边界，是安全使用 Agent 的关键

---

下一节：[4.5 Skill 与 Harness 机制](./skill-harness)
