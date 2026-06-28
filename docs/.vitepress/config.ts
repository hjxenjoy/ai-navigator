import { defineConfig } from 'vitepress'
import { withPwa } from '@vite-pwa/vitepress'

export default withPwa(defineConfig({
  title: 'AI Navigator',
  description: '写给工程师的 AI 完全指南——从会用到真正掌控',
  lang: 'zh-CN',
  cleanUrls: true,

  // 离线阅读（PWA）：访问过的页面会被缓存，断网也能看
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'AI Navigator',
      short_name: 'AI Navigator',
      description: '写给工程师的 AI 完全指南',
      lang: 'zh-CN',
      theme_color: '#3c8772',
      background_color: '#ffffff',
      display: 'standalone',
      icons: [
        { src: '/logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,woff2}'],
      navigateFallback: undefined,
    },
  },

  head: [
    ['link', { rel: 'icon', href: '/logo.svg', type: 'image/svg+xml' }],
    ['link', { rel: 'apple-touch-icon', href: '/logo.svg' }],
    ['meta', { name: 'theme-color', content: '#3c8772' }],
  ],

  themeConfig: {
    siteTitle: '🧭 AI Navigator',
    nav: [
      { text: '开始学习', link: '/ch0-mindset/' },
      { text: '复习巩固', link: '/review/' },
      { text: '词汇速查', link: '/glossary/' },
      { text: '跟上前沿', link: '/keep-current/' },
    ],

    sidebar: [
      {
        text: '📍 写在前面',
        items: [
          { text: '这份指南是什么', link: '/' },
          { text: '如何使用这份指南', link: '/how-to-use' },
          { text: '部署与离线阅读', link: '/deploy' },
        ],
      },
      {
        text: '第 0 章 · 建立正确认知',
        collapsed: false,
        items: [
          { text: '0.1 AI 到底是什么', link: '/ch0-mindset/' },
          { text: '0.2 LLM 在做什么事', link: '/ch0-mindset/what-llm-does' },
          { text: '0.3 AI 能做什么，不能做什么', link: '/ch0-mindset/capabilities' },
          { text: '0.4 当前技术版图', link: '/ch0-mindset/landscape' },
          { text: '0.5 国产大模型生态', link: '/ch0-mindset/china-llm' },
        ],
      },
      {
        text: '第 1 章 · LLM 工程精通',
        collapsed: true,
        items: [
          { text: '1.1 Token 与上下文', link: '/ch1-llm-engineering/' },
          { text: '1.2 系统性 Prompt 工程', link: '/ch1-llm-engineering/prompt-engineering' },
          { text: '1.3 生成参数详解', link: '/ch1-llm-engineering/parameters' },
          { text: '1.4 Tool Use 深度使用', link: '/ch1-llm-engineering/tool-use' },
          { text: '1.5 多轮对话与状态管理', link: '/ch1-llm-engineering/conversation' },
          { text: '1.6 流式输出与成本控制', link: '/ch1-llm-engineering/streaming-cost' },
          { text: '1.7 推理模型与思考模式', link: '/ch1-llm-engineering/reasoning-models' },
          { text: '1.8 多模态：图像与文档输入', link: '/ch1-llm-engineering/multimodal' },
          { text: '1.9 OpenAI 兼容协议与多模型切换', link: '/ch1-llm-engineering/openai-compatible' },
          { text: '1.10 在本地跑模型（Ollama）', link: '/ch1-llm-engineering/local-models' },
        ],
      },
      {
        text: '第 2 章 · 构建 AI 产品',
        collapsed: true,
        items: [
          { text: '2.1 RAG 完整 Pipeline', link: '/ch2-build-products/' },
          { text: '2.2 向量与语义搜索', link: '/ch2-build-products/embedding-search' },
          { text: '2.3 Agent 设计模式', link: '/ch2-build-products/agent-patterns' },
          { text: '2.4 为什么 Agent 会失控', link: '/ch2-build-products/agent-failure' },
          { text: '2.5 AI 系统的评估方法', link: '/ch2-build-products/evaluation' },
          { text: '2.6 生产环境的坑', link: '/ch2-build-products/production' },
          { text: '2.7 AI 应用安全', link: '/ch2-build-products/security' },
          { text: '2.8 成本估算实操', link: '/ch2-build-products/cost-estimation' },
          { text: '2.9 实战项目：知识库问答 Agent', link: '/ch2-build-products/capstone' },
        ],
      },
      {
        text: '第 3 章 · 理解引擎盖下面',
        collapsed: true,
        items: [
          { text: '3.1 Transformer 是什么', link: '/ch3-under-the-hood/' },
          { text: '3.2 Attention 机制的直觉', link: '/ch3-under-the-hood/attention' },
          { text: '3.3 模型是怎么训练出来的', link: '/ch3-under-the-hood/training' },
          { text: '3.4 Fine-tuning vs RAG', link: '/ch3-under-the-hood/finetuning-vs-rag' },
          { text: '3.5 怎么读 AI 论文', link: '/ch3-under-the-hood/read-papers' },
        ],
      },
      {
        text: '第 4 章 · MCP 与 Agent 生态',
        collapsed: true,
        items: [
          { text: '4.1 MCP 是什么，为什么重要', link: '/ch4-agent-mcp/' },
          { text: '4.2 用现有 MCP Server', link: '/ch4-agent-mcp/use-mcp' },
          { text: '4.3 自己写 MCP Server', link: '/ch4-agent-mcp/build-mcp' },
          { text: '4.4 Claude Code 深度使用', link: '/ch4-agent-mcp/claude-code' },
          { text: '4.5 Skill 与 Harness 机制', link: '/ch4-agent-mcp/skill-harness' },
          { text: '4.6 多 Agent 协作', link: '/ch4-agent-mcp/multi-agent' },
          { text: '4.7 AI 编程实战工作流', link: '/ch4-agent-mcp/ai-coding-workflow' },
          { text: '4.8 Agent = Model + Harness', link: '/ch4-agent-mcp/harness-engineering' },
          { text: '4.9 上下文工程', link: '/ch4-agent-mcp/context-engineering' },
        ],
      },
      {
        text: '第 5 章 · 深入与落地',
        collapsed: true,
        items: [
          { text: '5.1 RAG·进阶检索', link: '/ch5-deep-dives/' },
          { text: '5.2 RAG·接入真实向量库', link: '/ch5-deep-dives/vector-db' },
          { text: '5.3 RAG·评估与防幻觉', link: '/ch5-deep-dives/rag-eval' },
          { text: '5.4 RAG·真实文档处理', link: '/ch5-deep-dives/document-processing' },
          { text: '5.5 RAG·实战案例集', link: '/ch5-deep-dives/rag-cases' },
          { text: '5.6 MCP·三种能力与高层 SDK', link: '/ch5-deep-dives/mcp-capabilities' },
          { text: '5.7 MCP·生产级远程服务', link: '/ch5-deep-dives/mcp-production' },
          { text: '5.8 MCP·选型决策', link: '/ch5-deep-dives/mcp-decision' },
          { text: '5.9 MCP·案例集', link: '/ch5-deep-dives/mcp-cases' },
          { text: '5.10 Skill·究竟是什么', link: '/ch5-deep-dives/skills-intro' },
          { text: '5.11 Skill·手把手开发与打包', link: '/ch5-deep-dives/skills-build' },
          { text: '5.12 Skill·案例集', link: '/ch5-deep-dives/skills-cases' },
          { text: '5.13 微调·全流程与数据准备', link: '/ch5-deep-dives/finetuning-workflow' },
          { text: '5.14 微调·国产平台云端微调', link: '/ch5-deep-dives/finetuning-cloud' },
          { text: '5.15 微调·本地 LoRA 与 Ollama', link: '/ch5-deep-dives/finetuning-local' },
          { text: '5.16 微调·案例集与决策', link: '/ch5-deep-dives/finetuning-cases' },
        ],
      },
      {
        text: '第 6 章 · 提示词工程精通',
        collapsed: true,
        items: [
          { text: '6.1 提示词到底在调什么', link: '/ch6-prompt-mastery/' },
          { text: '6.2 提示词的解剖', link: '/ch6-prompt-mastery/anatomy' },
          { text: '6.3 推理与示例技巧深入', link: '/ch6-prompt-mastery/reasoning' },
          { text: '6.4 控制输出', link: '/ch6-prompt-mastery/output-control' },
          { text: '6.5 让提示词稳定可靠', link: '/ch6-prompt-mastery/reliability' },
          { text: '6.6 迭代与评估方法论', link: '/ch6-prompt-mastery/iteration' },
          { text: '6.7 场景·信息处理', link: '/ch6-prompt-mastery/playbook-info' },
          { text: '6.8 场景·代码与技术', link: '/ch6-prompt-mastery/playbook-code' },
          { text: '6.9 场景·对话客服与 RAG/Agent', link: '/ch6-prompt-mastery/playbook-chat-rag' },
          { text: '6.10 模型差异与反模式清单', link: '/ch6-prompt-mastery/model-differences' },
        ],
      },
      {
        text: '🎯 复习巩固',
        collapsed: false,
        items: [
          { text: '速记卡', link: '/review/' },
          { text: '自测题库', link: '/review/quiz' },
          { text: '决策速查', link: '/review/decisions' },
          { text: '常见坑与 FAQ', link: '/review/pitfalls' },
        ],
      },
      {
        text: '📖 词汇速查手册',
        items: [
          { text: '全部词汇', link: '/glossary/' },
        ],
      },
      {
        text: '📡 跟上 AI 前沿',
        items: [
          { text: '信息源与节奏', link: '/keep-current/' },
        ],
      },
    ],

    socialLinks: [],
    footer: {
      message: '写给自己的 AI 学习地图',
    },
    search: {
      provider: 'local',
    },
    outline: {
      label: '本页目录',
      level: [2, 3],
    },
    docFooter: {
      prev: '上一页',
      next: '下一页',
    },
    lastUpdated: {
      text: '最后更新',
    },
  },

  lastUpdated: true,
}))
