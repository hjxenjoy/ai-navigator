# AI Navigator

这是一份写给工程师的 AI 完全学习指南，以 VitePress 文档网站的形式组织。

## 技术栈

- **框架**：VitePress 1.x
- **包管理**：pnpm
- **语言**：TypeScript（仅配置文件），内容全为 Markdown

## 常用命令

```bash
pnpm dev      # 启动本地开发服务器，默认 http://localhost:5173
pnpm build    # 构建静态文件到 docs/.vitepress/dist/
pnpm preview  # 预览构建结果
```

## 目录结构

```
docs/
├── .vitepress/
│   └── config.ts          # VitePress 配置，包含导航栏和侧边栏
├── index.md               # 首页（Hero 页）
├── how-to-use.md          # 使用说明
├── ch0-mindset/           # 第0章：建立正确认知
├── ch1-llm-engineering/   # 第1章：LLM 工程精通
├── ch2-build-products/    # 第2章：构建 AI 产品
├── ch3-under-the-hood/    # 第3章：理解引擎盖下面
├── ch4-agent-mcp/         # 第4章：MCP 与 Agent 生态
├── glossary/              # 词汇速查手册
│   └── index.md           # 所有词汇按字母排序
└── keep-current/          # 跟上 AI 前沿
    └── index.md
```

每个章节目录下：
- `index.md` 是该章节第一节
- 其余文件按节命名（如 `prompt-engineering.md`）

## 内容规范

### 写作风格

- **中文为主**，英文技术词汇保留英文原文但加中文解释
- **通俗优先**：读者是有经验的工程师但数学背景薄弱，禁止直接用数学符号或公式
- 遇到数学概念，先给**直觉类比**，再说"你不需要理解具体原理"
- 每节结构：概念解释 → 类比/示例 → 实战意义 → 关键结论
- 代码示例用 JavaScript/Node.js（读者主语言），必要时才用 Python

### 固定格式约定

```markdown
> 💡 **类比**：...     ← 用类比解释概念
> ⚠️ **常见误解**：...  ← 纠正错误认知
🛠️ 实战练习            ← 可动手的练习，放在章节结尾、关键结论之前
## 📌 关键结论         ← 每节必有，列 3-5 条核心要点
下一节：[...]          ← 每节末尾的导航
```

### 实战练习要求

- 每个 🛠️ 练习必须包含：**具体步骤** + **期望结果** + **进阶挑战**（可选）
- 代码示例必须是**可直接运行的完整代码**，不能有未定义的函数
- 涉及 API 的练习要说明需要哪些环境变量

### 侧边栏配置

新增文档后，必须同步更新 `docs/.vitepress/config.ts` 里的 `sidebar` 配置，否则文档不会出现在导航里。

## 不要做的事

- 不要在内容里直接给出数学公式（如 Softmax 公式、余弦相似度公式）
- 不要用"如上所述"、"综上所述"等文章套话
- 不要创建章节目录之外的随机 Markdown 文件
- 不要修改 `pnpm-lock.yaml`（让 pnpm 自动管理）
- 不要在 `docs/.vitepress/cache/` 和 `docs/.vitepress/dist/` 下创建文件
