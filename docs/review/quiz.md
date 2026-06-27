# 自测题库

主动回忆比反复阅读记得牢。先自己想答案，再点开看。**手机上随时自测**。

---

## 第 0 章

**Q1. 为什么 AI 会"幻觉"？**

<details><summary>看答案</summary>

因为它在预测"听起来最合理的下一个词"，而不是"最真实的下一个词"。不确定时它不会说"不知道"，而是生成最像答案的内容。→ [0.2](/ch0-mindset/what-llm-does)
</details>

**Q2. 需要精确计算时，正确做法是？**

<details><summary>看答案</summary>

让 AI 写代码去算，而不是让它直接给数字。AI 生成的是"看起来像答案的数字"。→ [0.3](/ch0-mindset/capabilities)
</details>

**Q3. AI "不记得"上次对话，是 bug 吗？怎么解决？**

<details><summary>看答案</summary>

不是 bug，是架构设计（每次调用无状态）。解决：用外部存储（数据库/文件）持久化，每次用时读取。→ [0.3](/ch0-mindset/capabilities)
</details>

---

## 第 1 章

**Q4. "上下文 200k" 指 200k 个汉字吗？**

<details><summary>看答案</summary>

不是，指 200k 个 **Token**，中文大概 10-15 万汉字。→ [0.2](/ch0-mindset/what-llm-does)
</details>

**Q5. 输入 Token 和输出 Token，哪个更贵？**

<details><summary>看答案</summary>

输出更贵，通常是输入的 3-5 倍。→ [1.1](/ch1-llm-engineering/)
</details>

**Q6. 让 AI 输出准确的复杂答案，一个简单 Prompt 技巧是？**

<details><summary>看答案</summary>

CoT（思维链）：让它"先分析推理过程，再给答案"。因为每个 Token 都影响后续 Token。→ [1.2](/ch1-llm-engineering/prompt-engineering)
</details>

**Q7. Tool Use 里，工具执行报错了，最该做什么？**

<details><summary>看答案</summary>

把清晰的错误信息返回给 AI，让它能感知并调整。否则它会假设成功继续，导致跑偏。→ [1.4](/ch1-llm-engineering/tool-use)
</details>

**Q8. 什么时候该用推理模型？什么时候不该？**

<details><summary>看答案</summary>

该用：多步数学/逻辑、复杂代码、难题。不该用：简单问答/分类/翻译、实时交互、大批量低难度任务（又慢又贵）。默认用普通模型。→ [1.7](/ch1-llm-engineering/reasoning-models)
</details>

**Q9. 把代码从 DeepSeek 换成本地 Ollama，要改什么？**

<details><summary>看答案</summary>

只改 baseURL（`http://localhost:11434/v1`）、apiKey（占位）、model（如 `qwen2.5:14b`），业务代码不变——因为都兼容 OpenAI 协议。→ [1.9](/ch1-llm-engineering/openai-compatible)
</details>

---

## 第 2 章

**Q10. RAG 检索效果差，第一个该排查的是？**

<details><summary>看答案</summary>

分块（Chunking）——大小、重叠、切分方式。先调好分块再考虑换模型。→ [2.2](/ch2-build-products/embedding-search)
</details>

**Q11. 同一个向量库，能用 A 模型存、B 模型查吗？**

<details><summary>看答案</summary>

不能。不同 Embedding 模型维度和语义空间不同，必须用同一个模型。换模型 = 整库重建。→ [2.2](/ch2-build-products/embedding-search)
</details>

**Q12. 最简单有效的"防 Agent 失控"措施是？**

<details><summary>看答案</summary>

在 System Prompt 里写："遇到不确定或错误就停下来说明、等待指示，不要假设、不要继续。"→ [2.4](/ch2-build-products/agent-failure)
</details>

**Q13. 该不该用通用 Benchmark（MMLU 等）来判断模型对你项目好不好？**

<details><summary>看答案</summary>

不太够。更有用的是为你的**具体场景**建自己的评估集。→ [2.5](/ch2-build-products/evaluation)
</details>

---

## 第 3 章

**Q14. 为什么长上下文模型更贵更慢？**

<details><summary>看答案</summary>

Attention 计算量随输入长度的**平方**增长。100k→200k，计算量变 4 倍。→ [3.1](/ch3-under-the-hood/)
</details>

**Q15. AI 的"性格/价值观"从哪来？**

<details><summary>看答案</summary>

SFT 阶段的训练数据风格 + RLHF 阶段标注者的偏好。→ [3.3](/ch3-under-the-hood/training)
</details>

**Q16. 四个场景，分别用 Prompt / RAG / Fine-tune？(a) 200页每月更新的产品文档问答 (b) 固定团队代码风格 (c) 查用户历史订单 (d) 5000份标注合同分类**

<details><summary>看答案</summary>

(a) RAG (b) Fine-tune (c) Tool Use + RAG (d) Fine-tune。→ [3.4](/ch3-under-the-hood/finetuning-vs-rag)
</details>

---

## 第 4 章

**Q17. MCP 解决了什么问题？**

<details><summary>看答案</summary>

工具和 AI 的紧耦合：以前每个 AI 平台都要写不同集成。MCP 让工具"写一次、所有支持 MCP 的 AI 都能用"。→ [4.1](/ch4-agent-mcp/)
</details>

**Q18. 想让团队所有人 clone 项目后自动拥有同一套 MCP Server，配到哪？**

<details><summary>看答案</summary>

project 作用域 → 项目根目录的 `.mcp.json`，提交进 Git。→ [4.2](/ch4-agent-mcp/use-mcp)
</details>

**Q19. "Agent = Model + Harness" 这个公式想说明什么？**

<details><summary>看答案</summary>

Agent 不只是模型，而是"模型 + 外面那层脚手架"，表现一大半来自 Harness。所以调 Agent 常常是在调脚手架，而不是换更强的模型。→ [4.8](/ch4-agent-mcp/harness-engineering)
</details>

**Q20. 工具调用报错了，Harness 正确的处理方式是？为什么有效？**

<details><summary>看答案</summary>

把**完整的错误信息/栈**喂回给模型，让它自己看着改（Error Recovery）。有效是因为模型很擅长根据具体报错修正自己的参数；只说"失败了"它只能瞎猜。→ [4.8](/ch4-agent-mcp/harness-engineering)
</details>

**Q21. "补偿性代码（Compensatory Code）"是干嘛的？举两个例子。**

<details><summary>看答案</summary>

替模型兜底、补它短板的确定性代码——模型负责"聪明"，它负责"靠谱"。例如：用代码精确计数/计算（模型算不准）、JSON schema 强制校验（模型偶尔输出非法 JSON）、权限门禁（拦住危险操作）。→ [4.8](/ch4-agent-mcp/harness-engineering)
</details>

**Q22. 上下文工程的目标是"把上下文窗口塞满"吗？**

<details><summary>看答案</summary>

不是。目标是**每一步只放此刻最该看的东西**。桌子（窗口）大也要会收拾——塞太多反而稀释重点、"中间迷失"。→ [4.9](/ch4-agent-mcp/context-engineering)
</details>

**Q23. 上下文工程的三大手法是什么？各用一句话。**

<details><summary>看答案</summary>

①按需注入：用时才把指令/工具/资料放上桌，用完撤走；②压缩（Compaction）：旧内容摘成便签、原件收走腾 token；③隔离：子任务在独立上下文里跑，只把结论带回主线程。→ [4.9](/ch4-agent-mcp/context-engineering)
</details>

**Q24. 长任务里 Agent "把前面说的忘了"，对照上下文工程，可能怎么解决？**

<details><summary>看答案</summary>

重要信息别只埋在对话历史里（会被压缩掉）→ 放进 System Prompt / 文件 / 计划清单；或把大任务拆成多个干净的小对话 + 用隔离。→ [4.9](/ch4-agent-mcp/context-engineering)
</details>

---

下一页：[决策速查](./decisions)
