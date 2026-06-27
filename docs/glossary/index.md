# 词汇速查手册

按字母顺序排列，附通俗解释。遇到不认识的词，直接 Ctrl+F 搜。

---

## A

**Agent（代理/智能体）**  
能自主执行多步骤任务、使用工具的 AI 程序。和普通 AI 问答的区别是：Agent 会主动思考"下一步做什么"并行动，而不只是回答一次。

**Agentic Loop（Agent 循环）**  
Agent 的工作方式：思考 → 行动 → 观察结果 → 再思考，循环直到任务完成。

**Alignment（对齐）**  
让 AI 的行为符合人类的价值观和意图。简单说就是：让 AI 做你想让它做的事，而不是做它"觉得"对的事。

**Attention Mechanism（注意力机制）**  
Transformer 的核心：处理每个词时，动态决定应该"关注"输入里的哪些部分。就像你读句子时会重点关注关键词一样。

---

## B

**Base Model（基础模型）**  
只经过预训练、没有经过对话微调的模型。它能补全文字，但不能很好地"听指令"。GPT-3 是著名的 Base Model。

**Batch Processing（批处理）**  
一次性提交大量任务，异步处理。不是实时响应，但通常更便宜（约便宜 50%）。适合不需要实时结果的大规模数据处理。

**Benchmark（基准测试）**  
用来评估和对比模型能力的标准化测试集。MMLU、HumanEval 都是 Benchmark。

**BPE（Byte Pair Encoding）**  
一种常用的 Tokenization 方法。把常见的字符组合合并成一个 Token，从而减少 Token 总数。

---

## C

**Chain-of-Thought / CoT（思维链）**  
让 AI 在给出最终答案前，先把推理过程写出来。提高复杂问题的准确率。

**Checkpoint（检查点）**  
训练过程中保存的模型状态快照。训练一个大模型需要几个月，如果中断了，可以从最近的 Checkpoint 继续，不用从头开始。

**Chunking（分片）**  
把长文档切成小段，用于 RAG 检索。每段叫一个 Chunk。

**Context Compression（上下文压缩）**  
当对话太长超出上下文窗口时，自动把早期对话压缩成摘要的机制。

**Context Window（上下文窗口）**  
AI 每次处理时能"看到"的内容总量上限，以 Token 计算。超出这个范围的内容 AI 就"看不见"了。

**Cosine Similarity（余弦相似度）**  
计算两个向量有多相似的数学方法，结果在 -1 到 1 之间。向量数据库用它来找"语义最接近"的内容。

---

## D

**Distillation（蒸馏）**  
用一个大模型来训练一个小模型，让小模型学习大模型的行为。目的是用更小、更快的模型获得接近大模型的效果。

**DPO（Direct Preference Optimization）**  
训练方法的一种，让模型学习人类的偏好（哪种回答更好）。比 RLHF 更简单稳定。

---

## E

**Embedding（向量化/嵌入）**  
把文字转换成数字向量的过程。意思相近的文字转换后的向量也相近，是语义搜索的基础。

**Eval（评估）**  
测试 AI 系统在特定任务上的表现。建立 Eval 体系是持续改进 AI 系统的关键。

**Endpoint（端点）**  
API 服务的访问地址。在 AI 场景里通常指你发 API 请求的 URL，如 `https://api.anthropic.com/v1/messages`。

---

## F

**Few-shot（少样本）**  
在 Prompt 里给 2-5 个示例，帮助 AI 理解你想要什么格式或风格。

**Fine-tuning（微调）**  
在预训练模型的基础上，用你自己的数据继续训练，让模型适应特定任务或风格。

**Foundation Model（基础模型/大模型）**  
经过大规模预训练的模型，可以作为各种下游任务的起点。Claude、GPT-4 都是 Foundation Model。

**Function Calling（函数调用）**  
AI 请求执行特定工具/函数的机制，和 Tool Use 是同一回事（OpenAI 叫 Function Calling，Anthropic 叫 Tool Use）。

---

## G

**GPU（图形处理器）**  
最初用于游戏画面渲染，因为擅长并行计算，现在被用于 AI 训练和推理。训练大模型需要数千块 GPU。

**Grounding（接地）**  
让 AI 的回答基于真实、可验证的信息，而不是"凭空捏造"。RAG 是一种接地技术。

**Ground Truth（真实标签）**  
评估 AI 时用的"正确答案"基准。

**Guardrails（护栏）**  
对 AI 的输入和输出加的安全检查层，防止有害内容进入或敏感信息泄露。

---

## H

**Hallucination（幻觉）**  
AI 一本正经地输出错误信息。比如编造不存在的引用、给出错误的事实。根本原因是 AI 在"预测合理内容"而不是"确认真实内容"。

**Handoff（移交）**  
多 Agent 场景里，一个 Agent 完成任务后把结果和上下文移交给下一个 Agent。

**Harness（框架/脚手架）**  
运行 Agent 的底层框架，负责工具调用、权限管理、上下文管理等。Claude Code 的 Harness 是它的运行引擎。

**Hybrid Search（混合搜索）**  
结合关键词搜索和语义搜索，取两者优势。

---

## I

**Index（索引）**  
为了加速搜索建立的数据结构。向量数据库里的索引让相似性搜索更快。

**Inference（推理）**  
用训练好的模型生成输出的过程（相对于训练）。你每次问 AI 问题，它"回答"就是在做推理。

**Instruct Model（指令模型）**  
经过 SFT 微调、能按照指令操作的模型。你日常用的 Claude、GPT-4 都是 Instruct Model。

---

## J

**Jailbreak（越狱）**  
通过特殊的 Prompt 绕过 AI 的安全限制，让它说出本来不该说的内容。

**JSON Mode（JSON 模式）**  
让 AI 只输出合法 JSON 的模式，方便程序解析。

---

## K

**KV Cache（键值缓存）**  
缓存 Attention 计算中间结果的机制。避免对历史消息重复计算，提升响应速度、降低成本。

---

## L

**Latency（延迟）**  
发出请求到收到响应的等待时间。AI 响应通常比普通 API 慢，需要特别考虑。

**LLM（Large Language Model，大语言模型）**  
用大量文本训练的大规模语言模型。Claude、GPT、Gemini 都是 LLM。

**LLM-as-Judge（以 LLM 为评判者）**  
用一个 AI 模型来评估另一个 AI 模型的输出质量，代替人工评分。

**LoRA（Low-Rank Adaptation）**  
高效的 Fine-tuning 方法，只训练少量新参数，大幅降低训练成本。

**Logits**  
模型输出的原始分数，经过 Softmax 转换后变成概率。你通常不会直接接触这个，但看技术文档时会看到。

---

## M

**MCP（Model Context Protocol）**  
Anthropic 发布的开放协议，定义了 AI 模型和外部工具之间的标准通信方式。

**Memory（记忆）**  
Agent 保存和访问信息的机制，分工作记忆（当前上下文）、短期记忆（当前会话）、长期记忆（持久化存储）。

**MoE（Mixture of Experts，混合专家）**  
模型架构，包含多个"专家"子网络，每次处理只激活部分专家，在保持能力的同时降低计算成本。

**Multimodal（多模态）**  
能处理多种类型数据（文字、图片、音频、视频）的模型。Claude 3、GPT-4V 都是多模态模型。

---

## O

**One-shot（单样本）**  
在 Prompt 里只给一个示例。

**Orchestration（编排）**  
协调多个 Agent 或工具协同工作的过程。

---

## P

**Parameter（参数）**  
模型里存储的数值，是训练的结果。"700 亿参数的模型"就是模型里有 700 亿个这样的数字。

**Perplexity（困惑度）**  
衡量模型对一段文本的"困惑程度"。困惑度越低，说明模型认为这段文本越"正常"。通常作为语言模型的评估指标。

**Planning（规划）**  
Agent 在执行任务前制定计划的过程。好的 Planning 能让复杂任务更可控。

**Pre-training（预训练）**  
在大量数据上训练模型的第一阶段，目标是让模型学会语言和知识的基础。

**Prompt（提示词）**  
你给 AI 的输入，包括问题、指令、上下文等一切内容。

**Prompt Injection（提示词注入）**  
通过输入内容覆盖或修改 AI 指令的攻击方式，是 AI 应用的安全威胁之一。

---

## Q

**QLoRA**  
在 LoRA 基础上加入量化（Quantization），进一步降低 Fine-tuning 的显存需求。

**Quantization（量化）**  
用更少的比特表示模型参数，让大模型能在更小的硬件上运行，代价是精度略有损失。

---

## R

**RAG（Retrieval-Augmented Generation，检索增强生成）**  
先从外部知识库检索相关内容，再让 AI 基于这些内容生成回答。解决 AI 知识固定、不能获取实时信息的问题。

**Rate Limiting（限流）**  
API 提供商对请求频率的限制。超出限制会收到 429 错误，需要等待后重试。

**ReAct（推理+行动）**  
Agent 模式：Reasoning（推理）+ Acting（行动）交替进行。

**Reranking（重排序）**  
对初步检索结果用更精确的模型重新排序，提高检索质量。

**Retrieval（检索）**  
从知识库里找到与查询最相关内容的过程，是 RAG 的核心步骤。

**RLHF（Reinforcement Learning from Human Feedback，人类反馈强化学习）**  
通过人类标注者的偏好评分来训练模型，让模型更有帮助、更安全。

---

## S

**Sampling（采样）**  
从概率分布里选择下一个 Token 的过程，受 Temperature、Top-P、Top-K 参数控制。

**SDK（软件开发工具包）**  
封装了 API 调用的代码库，让开发者更方便地使用某个服务。

**Seed（随机种子）**  
控制随机性的初始值，相同 Seed 在相同参数下大概率产生相同输出。

**Self-Attention（自注意力）**  
Attention 的一种形式，序列中每个位置都能"关注"其他所有位置。

**Semantic Search（语义搜索）**  
理解查询意图进行搜索，而不是简单的关键词匹配。

**SFT（Supervised Fine-Tuning，监督微调）**  
用"问题-好回答"配对数据训练模型，让它学会按指令回答。

**SLM（Small Language Model，小语言模型）**  
参数量较小（通常 7B 以下）的语言模型，能在消费级设备上运行。

**Softmax**  
把一组数字转换成概率分布的函数（保证相加等于 1）。在 LLM 里用于把 Logits 转成 Token 概率。

**Stop Sequence（停止序列）**  
当 AI 生成到这个特定字符串时立刻停止输出。

**Streaming（流式输出）**  
AI 生成一个 Token 就立刻发送，而不是等全部生成完再发送。提升用户体验。

**Structured Output（结构化输出）**  
让 AI 输出固定格式的内容，如 JSON，便于程序解析。

**Subagent（子代理）**  
在多 Agent 系统里，由主 Agent 委派执行子任务的 Agent。

**System Prompt（系统提示）**  
在对话开始前设置的全局指令，告诉 AI 角色、规则、背景信息。

---

## T

**Temperature（温度）**  
控制 AI 输出随机性的参数。低温度 = 稳定保守，高温度 = 创意发散。

**Token（词元）**  
AI 处理文字的最小单位，不等于一个字。中文每个汉字约 1-2 个 Token。

**Tokenization（词元化）**  
把文字转换成 Token 序列的过程。

**Tool Schema（工具模式）**  
描述一个工具的名称、功能、参数的结构化定义，告诉 AI 如何使用这个工具。

**Tool Use（工具使用）**  
AI 调用外部工具（搜索、数据库、API）来完成任务的能力。

**Top-K**  
每次生成 Token 时，只从概率最高的 K 个候选里选。

**Top-P（Nucleus Sampling）**  
每次生成 Token 时，从概率累计到 P% 为止的候选里选。

**Throughput（吞吐量）**  
单位时间内能处理的请求数量，是衡量 AI 服务性能的指标之一。

**Transformer（变换器）**  
当前所有主流大模型的基础架构，2017 年提出，核心是 Attention 机制。

**Tree-of-Thought / ToT（思维树）**  
CoT 的升级版，让 AI 探索多条推理路径，类似"多方案比较"。

---

## V

**Vector（向量）**  
一组数字，在 AI 里通常指 Embedding 的结果。用来表示文字在语义空间里的位置。

**Vector Database（向量数据库）**  
专门存储和搜索向量的数据库，支持高效的相似性搜索。

**VLM（Vision Language Model，视觉语言模型）**  
能同时理解图片和文字的模型，如 GPT-4V、Claude 3。

**VRAM（显存）**  
GPU 的内存，运行大模型需要大量 VRAM。

---

## W

**Weight（权重）**  
模型参数的另一种叫法，训练过程中通过反向传播不断调整。

**Worktree**  
Git 的功能，允许同一个仓库有多个工作目录。Claude Code 用它让 Agent 在隔离环境里工作。

---

## Z

**Zero-shot（零样本）**  
不给任何示例，直接让 AI 完成任务。适合 AI 能理解的标准任务。
