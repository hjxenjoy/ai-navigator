# 🧭 AI Navigator

> 写给工程师的 AI 完全指南——从会用，到真正掌控

本项目是一份系统性的 AI 学习文档，以 VitePress 网站的形式呈现。内容面向**已经在使用 AI 工具、但想深入理解其原理和机制**的工程师，而不是 AI 零基础入门。

## 在线阅读

```bash
pnpm install
pnpm dev
# 打开 http://localhost:5173
```

## 内容结构

| 章节 | 核心问题 |
|-----|---------|
| **第 0 章** 建立正确认知 | AI 到底是什么？LLM 在做什么？它能做什么、不能做什么？**国产大模型生态** |
| **第 1 章** LLM 工程精通 | Token、Prompt 工程、生成参数、Tool Use、成本控制、**推理模型、多模态、OpenAI 兼容协议、本地运行（Ollama）** |
| **第 2 章** 构建 AI 产品 | RAG（含分块策略）、向量搜索、Agent 设计、**为什么 Agent 会失控**、评估、生产环境（含可观测性） |
| **第 3 章** 理解引擎盖下面 | Transformer 原理、训练过程、Fine-tuning vs RAG |
| **第 4 章** MCP 与 Agent 生态 | MCP 协议、写 MCP Server、Claude Code 深度使用、Skill 与 Harness |
| **词汇速查** | 全部 AI/工程词汇 A-Z，通俗解释 |
| **跟上前沿** | 高效跟踪 AI 进展的信息策略 |

## 设计原则

**通俗优先，不堆公式**：遇到数学概念，先给直觉类比，再说"你不需要理解具体原理"。

**面向工程判断，不追学术深度**：每个原理都回答"知道这个，对我做工程决策有什么帮助"。

**有练习，不只是阅读**：关键章节有可直接运行的代码练习，而不只是概念罗列。

## 本地开发

**前置要求**：Node.js 18+，pnpm

```bash
# 克隆项目
git clone <repo-url>
cd ai-navigator

# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建
pnpm build
```

## 新增内容

1. 在对应章节目录下新建 `.md` 文件
2. 在 `docs/.vitepress/config.ts` 的 `sidebar` 里添加对应条目
3. 遵循文档规范：参考 `CLAUDE.md` 里的写作约定

## 技术栈

- [VitePress](https://vitepress.dev/) — 文档框架
- pnpm — 包管理
