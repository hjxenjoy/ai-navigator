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

## 第 5 章 · 深入与落地

### RAG 深入

**Q25. 基础 RAG 检索为什么常"找不准"？举一个改进手法。**

<details><summary>看答案</summary>

根因：问题的形态 ≠ 答案的形态（口语 vs 正式措辞）。手法：查询改写、HyDE（先编个假答案去检索）、多路召回、父文档检索。→ [5.1](/ch5-deep-dives/)
</details>

**Q26. "上下文检索（Contextual Retrieval）"是怎么提升召回的？**

<details><summary>看答案</summary>

嵌入每个块之前，先让 LLM 生成一小段背景说明拼在块前面再 embedding，解决"块太碎、缺主体/时间"的问题。Anthropic 实测大幅降低检索失败率。→ [5.4](/ch5-deep-dives/document-processing)
</details>

**Q27. RAG 分哪两层评估？生成层最重要的指标是什么？**

<details><summary>看答案</summary>

检索层（相关文档召回没有，看 Recall@k）和生成层（答得忠不忠实）。生成层最重要是**忠实度**：回答每句是否都有检索依据，用 LLM-as-Judge 判。→ [5.3](/ch5-deep-dives/rag-eval)
</details>

### MCP 深入

**Q28. MCP 的 Tool 和 Resource 有什么区别？**

<details><summary>看答案</summary>

Tool = 让 AI"做动作"（查库、下单，AI 决定何时调）；Resource = 只读"数据源"（挂文档/配置给 AI 读）。→ [5.6](/ch5-deep-dives/mcp-capabilities)
</details>

**Q29. 做远程 MCP 服务用什么传输？鉴权要注意什么？**

<details><summary>看答案</summary>

用 Streamable HTTP（SSE 已淘汰），无状态模式最易部署。鉴权用 OAuth，但**别自己手搓**，委托给成熟方案；用 MCP Inspector 调试。→ [5.7](/ch5-deep-dives/mcp-production)
</details>

**Q30. "让 Claude Code 查公司数据库"用 MCP 还是应用内 Tool？为什么？**

<details><summary>看答案</summary>

MCP。因为客户端是 Claude Code（不是你自己的 App），要跨客户端复用"查库"这个外部能力。自己 App 内用 AI 才用 Function Calling。→ [5.8](/ch5-deep-dives/mcp-decision)
</details>

### Skill 开发

**Q31. Skill 的"渐进式披露"三层是什么？解决什么问题？**

<details><summary>看答案</summary>

①平时只加载 name+description（~100token）②激活才读完整 SKILL.md ③按需才读 reference/跑脚本。解决"装很多 Skill 又不占爆上下文"。→ [5.10](/ch5-deep-dives/skills-intro)
</details>

**Q32. Skill 的 `description` 为什么极其重要？**

<details><summary>看答案</summary>

AI 靠它判断"何时自动触发"这个 Skill。要写清"做什么+什么时候用"并含用户真实说法；写砸了装了也不触发。→ [5.10](/ch5-deep-dives/skills-intro)
</details>

### 模型微调

**Q33. 微调 80% 的功夫在哪？数据是什么格式？**

<details><summary>看答案</summary>

在数据准备（质量>数量、一致性、覆盖分布、划验证集）。格式是 ChatML 的 JSONL，`assistant` 内容就是你要模型学会的标准输出。→ [5.13](/ch5-deep-dives/finetuning-workflow)
</details>

**Q34. 本地微调（LoRA→GGUF→Ollama）最常见的翻车点是什么？**

<details><summary>看答案</summary>

训练时用的 chat template 和 Ollama Modelfile 里的 TEMPLATE 不一致 → 输出乱码/答非所问。两边必须用同一套模板。→ [5.15](/ch5-deep-dives/finetuning-local)
</details>

**Q35. 一个任务该不该微调，决策顺序是怎样的？**

<details><summary>看答案</summary>

先穷尽 Prompt+Few-shot；缺知识/要实时用 RAG；只有"要稳定的格式/风格/专项准确率、Prompt 搞不定、且有几百+条数据"才微调（敏感数据本地、图省事云端）。→ [5.16](/ch5-deep-dives/finetuning-cases)
</details>

---

下一页：[决策速查](./decisions)
