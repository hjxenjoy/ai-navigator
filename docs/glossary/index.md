# 词汇速查手册

按字母顺序排列，附通俗解释。遇到不认识的词，直接 Ctrl+F 搜。

---

## A

**Agent（代理/智能体）**  
能自主执行多步骤任务、使用工具的 AI 程序。和普通 AI 问答的区别是：Agent 会主动思考"下一步做什么"并行动，而不只是回答一次。

**Agentic（智能体化 / 主动式 AI）**  
描述一种 AI 工作模式：模型不只是回答问题，而是自主规划步骤、调用工具、观察结果并循环推进，直到完成整个目标。核心转变是"循环由模型驱动"而非用户每步手动推进。三个核心特征：① 自主规划（把目标拆成子任务）；② 工具使用（执行代码、调用 API、读写文件）；③ 反馈循环（根据执行结果调整下一步）。MCP、多 Agent 协作、工作流编排都是 Agentic 生态的具体实现形式。详见 [第4章导读](/ch4-agent-mcp/agentic-intro)。

**Agentic Loop（Agent 循环）**  
Agent 的工作方式：思考 → 行动 → 观察结果 → 再思考，循环直到任务完成。

**Agentic RAG（智能体式 RAG）**  
把"检索"做成 Agent 的一个工具，让模型自己决定要不要检索、改写查询、多轮多跳，并自评资料够不够再作答。适合含糊、多步的复杂查询。详见 [5.17](/ch5-deep-dives/rag-advanced)。

**Agent Workspace（智能体工作区）**  
Agent 干活时专属的"工位"——一个能让它读写文件、跑命令、存中间结果的目录/环境。两个关键用途：① 把上下文窗口装不下的东西（中间产物、长报告、抓来的数据）写进文件，需要时再读回来，相当于**外部记忆**；② 多 Agent 协作时给每个 Agent 一个独立 workspace（常用 Worktree 或容器），各改各的、互不污染。本质上是把文件系统当成模型的"文件柜+草稿纸"。详见 [4.9 上下文工程](/ch4-agent-mcp/context-engineering)。

**Alignment（对齐）**  
让 AI 的行为符合人类的价值观和意图。简单说就是：让 AI 做你想让它做的事，而不是做它"觉得"对的事。

**ASR（Automatic Speech Recognition，语音识别）**  
把语音转成文字，是语音对话流水线的"耳朵"。用于会议纪要、字幕、语音输入等。开源标杆是 Whisper。详见 [1.12 语音与实时](/ch1-llm-engineering/voice-realtime)。

**Attention Mechanism（注意力机制）**  
Transformer 的核心：处理每个词时，动态决定应该"关注"输入里的哪些部分。就像你读句子时会重点关注关键词一样。

**AutoGen**  
微软的多 Agent 框架，主打让多个角色 Agent 互相对话协作完成任务。

---

## B

**Background Notification（后台通知）**  
Agent 的长任务在后台跑完（或需要你拍板）时主动通知你，不用全程盯着。是 Harness 的一个零件。



**Base Model（基础模型）**  
只经过预训练、没有经过对话微调的模型。它能补全文字，但不能很好地"听指令"。GPT-3 是著名的 Base Model。

**Batch API（批量 API）**  
AI 服务提供商（OpenAI/Anthropic）提供的异步批量处理接口。将大量请求打包异步执行，通常 24 小时内返回结果，成本比同步 API 便宜约 50%。适合批量摘要、批量分类、批量 Embedding 等非实时场景。

**Batch Processing（批处理）**  
一次性提交大量任务，异步处理。不是实时响应，但通常更便宜（约便宜 50%）。适合不需要实时结果的大规模数据处理。

**Benchmark（基准测试）**  
用来评估和对比模型能力的标准化测试集。MMLU、HumanEval 都是 Benchmark。

**BM25**  
一种经典的关键词搜索算法，按词频等信号给文档打分。你不需要记它的细节，知道它是"关键词搜索"的技术叫法即可，常和语义搜索组成 Hybrid Search。

**BPE（Byte Pair Encoding）**  
一种常用的 Tokenization 方法。把常见的字符组合合并成一个 Token，从而减少 Token 总数。

---

## C

**Canary / 灰度发布**  
新版本（新 Prompt 或新模型）先放给一小撮流量，用线上指标对比新旧、确认没问题再逐步放量，降低上线风险。详见 [2.10](/ch2-build-products/safe-launch)。

**Chain-of-Thought / CoT（思维链）**  
让 AI 在给出最终答案前，先把推理过程写出来。提高复杂问题的准确率。

**Checkpoint（检查点）**  
训练过程中保存的模型状态快照。训练一个大模型需要几个月，如果中断了，可以从最近的 Checkpoint 继续，不用从头开始。

**Chunking（分片/分块）**  
把长文档切成小段，用于 RAG 检索。每段叫一个 Chunk。分块策略（大小、重叠）直接影响检索质量。

**Circuit Breaker（熔断器）**  
借自微服务架构的容错模式。当 AI API 的错误率超过阈值，熔断器"打开"——暂停所有请求一段时间，避免在下游故障时继续消耗资源。恢复期后进入"半开"状态试探，成功则关闭熔断器。→ 见 2.14

**Compaction（压缩/紧实化）**  
上下文快满时，把旧内容摘要成精简版、收走原件以腾出 token 空间。和 Context Compression 是一回事。

**Compensatory Code（补偿性代码）**  
Harness 里专门替模型兜底、补它短板的确定性代码。模型负责"聪明"，这部分负责"靠谱"（如精确计数、JSON 校验、权限拦截）。

**Computer Use（电脑操作）**  
让 Agent 像人一样看屏幕、点鼠标、敲键盘，去操作没有 API 的软件。两条路线：视觉（截图→点坐标，通用但慢/贵）和浏览器 Agent（基于 DOM/无障碍树，更稳更快）。详见 [4.11](/ch4-agent-mcp/computer-use)。

**Constitutional AI（宪法式 AI）**  
Anthropic 训练 Claude 的方法：先写下一组原则（"宪法"），让 AI 用这些原则自我评判和改进回答，减少对人工标注的依赖。

**Context Caching（上下文缓存）**  
当多次请求开头内容相同（如固定的 System Prompt），服务端缓存这部分的计算，命中时按更低价格计费。DeepSeek/OpenAI 自动生效，Claude 需手动标记 `cache_control`。和 KV Cache 是同一机制的不同叫法/用法层面。

**Context Compression（上下文压缩）**  
当对话太长超出上下文窗口时，自动把早期对话压缩成摘要的机制。

**Context Engineer（上下文工程师）**  
一种工程师角色定位：工作对象不是单条 Prompt，而是模型每轮"看得见什么"。核心问题是上下文窗口里每一步该摆什么、怎么摆、何时清理。详见 [4.9](/ch4-agent-mcp/context-engineering)、[4.15](/ch4-agent-mcp/engineer-roles)。

**Context Window（上下文窗口）**  
AI 每次处理时能"看到"的内容总量上限，以 Token 计算。超出这个范围的内容 AI 就"看不见"了。

**Continuous Batching（连续批处理）**  
生产推理引擎让吞吐起飞的关键：把同时到达的多个请求拼成一批一起算，谁先生成完谁先"下车"、空位立刻补新请求，GPU 不空转。详见 [1.13](/ch1-llm-engineering/self-hosting)。

**Context Engineering（上下文工程）**  
精心管理"往模型上下文窗口里塞什么"的功夫，是 Harness 最核心的一块。三大手法：按需注入、压缩、隔离。

**Control Flow（控制流）**  
Agent 的执行流程设计：何时循环、分支、停止、回退。常见套路是 Plan-Execute-Verify（先规划、再执行、后验证）。

**Cosine Similarity（余弦相似度）**  
计算两个向量有多相似的数学方法，结果在 -1 到 1 之间。向量数据库用它来找"语义最接近"的内容。

---

## D

**Data Flywheel（数据飞轮）**  
AI 产品的自我强化增长循环。产品跑得越久 → 收集到越多用户行为数据 → 数据驱动模型/Prompt 改进 → AI 质量提升 → 更多用户 → 更多数据。显式反馈（点赞/踩）和隐式信号（复制输出、立刻重试）都是飞轮的原料。→ 见 2.18

**Diffusion（扩散模型）**  
主流文生图/视频模型的工作方式：从一团随机噪点出发，一步步"去噪"还原出图像。你不需要理解具体原理，记住它是"引导而非命令"——靠提示词和参数引导方向，没法像文字那样精确控制每个像素。详见 [1.11 图像与视频生成](/ch1-llm-engineering/image-video-gen)。

**Distillation（蒸馏）**  
用一个大模型来训练一个小模型，让小模型学习大模型的行为。目的是用更小、更快的模型获得接近大模型的效果。

**DPO（Direct Preference Optimization）**  
训练方法的一种，让模型学习人类的偏好（哪种回答更好）。比 RLHF 更简单稳定。

**Dynamic Intensity（动态强度）**  
Harness 按任务难度动态调节投入的"努力/算力"：简单的事快速过，难的事才全力深思（呼应推理模型的 reasoning_effort）。

---

## E

**Embedding（向量化/嵌入）**  
把文字转换成数字向量的过程。意思相近的文字转换后的向量也相近，是语义搜索的基础。

**Eval（评估）**  
测试 AI 系统在特定任务上的表现。建立 Eval 体系是持续改进 AI 系统的关键。

**Endpoint（端点）**  
API 服务的访问地址。在 AI 场景里通常指你发 API 请求的 URL，如 `https://api.anthropic.com/v1/messages`。

**Error Recovery（错误恢复）**  
Agent 工具/命令出错时，Harness 把完整报错喂回给模型让它自己修，而不是假装成功继续。模型很擅长看着具体报错改对参数。

---

## F

**Feedback Loop（反馈回路）**  
Agent 每行动一步后，用客观手段（测试、linter、LLM 评判、校验器）检查对不对，把纠正信号反馈回去。是 Agent 可靠性的命根子。

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

**Golden Dataset（黄金数据集）**  
人工精心标注的"输入 → 期望输出"对集合，是 AI 系统的质量基线。与测试数据集不同，黄金数据集通常用 mustContain/mustNotContain 做柔性匹配（而非精确字符串），并与代码一起版本控制。→ 见 2.17

**GPU（图形处理器）**  
最初用于游戏画面渲染，因为擅长并行计算，现在被用于 AI 训练和推理。训练大模型需要数千块 GPU。

**Graph Engineer（图工程师）**  
一种工程师角色定位：工作对象是多 Agent / 多节点的编排图，核心技能是 Node 切分、Edge 控制流、State Schema 设计三件套，让系统结构可控、可调试。可看作 Loop Engineer 在系统架构层面的延伸。详见 [4.12](/ch4-agent-mcp/workflow-orchestration)、[4.16](/ch4-agent-mcp/graph-engineering)。

**GraphRAG（图谱增强检索）**  
RAG 进阶范式：离线先用 LLM 把文档抽成"实体 + 关系"知识图谱并生成社区摘要，于是能回答朴素 RAG 答不了的全局型、跨文档关系型问题。代价是建库成本高。详见 [5.17](/ch5-deep-dives/rag-advanced)。

**GRPO（Group Relative Policy Optimization）**  
DeepSeek-R1 训练推理能力用的强化学习方法。核心思路：让模型反复尝试，只奖励"最终答案对不对"，模型自己学出推理能力。你只需知道它是"训练推理模型的一种 RL 方法"。

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

**Hard Negatives（难负样本）**  
训练检索/Embedding 模型时，"看起来相关、其实不对"的负样本（如查"苹果手机保修"，难负样本是"以旧换新"）。比随便的无关负样本难区分，其质量基本决定微调效果。详见 [5.18](/ch5-deep-dives/finetuning-retrieval)。

**Harness（框架/脚手架）**  
模型外面那层"控制系统"，负责工具调用、控制流、错误恢复、上下文管理、权限等。有个公式：**Agent = Model + Harness**——Agent 表现一大半来自这层挽具，不只靠模型。

**Harness Engineering（脚手架工程）**  
设计和打磨 Harness 的工程实践，零件包括控制流设计、错误恢复、反馈回路、计划追踪、动态强度、补偿性代码、上下文工程等。

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

**Isolation（隔离）**  
让子任务在各自独立的上下文/环境里跑，互不污染，只把结论带回主线程。如 Subagent 独立上下文、Worktree 隔离目录。

---

## J

**Jailbreak（越狱）**  
通过特殊的 Prompt 绕过 AI 的安全限制，让它说出本来不该说的内容。

**JSON Mode（JSON 模式）**  
让 AI 只输出合法 JSON 的模式，方便程序解析。

---

## K

**Knowledge Cutoff（知识截止日期）**  
模型训练数据的截止时间，之后发生的事它不知道。要回答最新信息，必须给它工具（搜索/查 API）去取，而不是靠"记忆"。

**K-quants**  
GGUF 量化格式中的一种混合精度方案（如 Q4_K_M、Q5_K_S）。K 表示 K-means 量化，相比纯整数量化（Q4_0）在同等大小下质量更好。M/S/L 后缀表示中等/小/大变体，影响 Attention 层的精度。→ 见 3.7

**KV Cache（键值缓存）**  
缓存 Attention 计算中间结果的机制。避免对历史消息重复计算，提升响应速度、降低成本。

---

## L

**LangChain / LangGraph**  
最老牌的 LLM 应用/Agent 开发框架。LangGraph 专门用图来描述 Agent 的控制流。帮你搭"挽具"，但也藏起细节，建议先懂原理再用。

**Latency（延迟）**  
发出请求到收到响应的等待时间。AI 响应通常比普通 API 慢，需要特别考虑。看延迟要盯 P95/P99（最慢的 5%/1%），平均值会骗人。

**Long-term Memory（长期记忆）**  
让 Agent 跨会话记住信息的机制，存在外部（向量库/数据库/文件），按当前需要检索后注入——区别于"一次会话即清"的上下文短期记忆。本质是对"记忆"的一次 RAG。详见 [4.10](/ch4-agent-mcp/long-term-memory)。

**LLM（Large Language Model，大语言模型）**  
用大量文本训练的大规模语言模型。Claude、GPT、Gemini 都是 LLM。

**LLM-as-Judge（以 LLM 为评判者）**  
用一个 AI 模型来评估另一个 AI 模型的输出质量，代替人工评分。

**LLM Router（模型路由）**  
根据请求的复杂度或类型，自动分配到最合适模型的中间层。简单问题路由到小模型（便宜快速），复杂推理路由到大模型（准确但贵）。代表实现：RouteLLM、LiteLLM Router、自定义规则路由。目标是在相同效果下大幅降低成本。

**Loop Engineer（循环工程师）**  
一种工程师角色定位：工作对象是人机协作的闭环——目标怎么定义、结果怎么验证、错了怎么纠偏迭代。核心是让"AI 干活"的循环可控，标志性能力是建立客观验证环节而非堆重试。详见 [4.7](/ch4-agent-mcp/ai-coding-workflow)、[4.15](/ch4-agent-mcp/engineer-roles)。

**LoRA（Low-Rank Adaptation）**  
高效的 Fine-tuning 方法，只训练少量新参数，大幅降低训练成本。

**Logits**  
模型内部为每个候选词打的"原始分数"，数值还没有经过任何归一化处理（可能是负数、很大的正数）。经过 Softmax 处理后才变成"每个词出现的概率"（0到1之间、加起来等于1）。你通常不会直接接触这个，但看技术文档或报错时可能看到。

---

## M

**Matryoshka Embedding（俄罗斯套娃 Embedding）**  
一种训练方式，使 Embedding 向量的前 N 维也具备完整的语义表征能力。好处是可以按需截断维度（如 1536→256），灵活权衡存储成本和检索质量，不需要重新训练。→ 见 1.15

**MCP（Model Context Protocol）**  
Anthropic 发布的开放协议，定义了 AI 模型和外部工具之间的标准通信方式。

**Memory（记忆）**  
Agent 保存和访问信息的机制，分工作记忆（当前上下文）、短期记忆（当前会话）、长期记忆（持久化存储）。

**Model Merging（模型合并）**  
将多个独立微调的模型权重合并为一个，兼得不同能力的技术。常用方法：SLERP（球面线性插值）、TIES（裁剪冲突权重）、DARE（稀疏化后合并）。无需额外训练，但需要底模相同。

**MoE（Mixture of Experts，混合专家）**  
模型架构，包含多个"专家"子网络，每次处理只激活部分专家，在保持能力的同时降低计算成本。

**Multimodal（多模态）**  
能处理多种类型数据（文字、图片、音频、视频）的模型。Claude 3、GPT-4V 都是多模态模型。

---

## N

**Negative Prompt（负向提示词）**  
文生图特有的旋钮：单独告诉模型"不想要什么"（如 `低质量, 多余的手指, 模糊`），是修瑕疵的主力手段。文本生成里没有对应概念。详见 [1.11 图像与视频生成](/ch1-llm-engineering/image-video-gen)。

---

## O

**Observability（可观测性）**  
上线后能"看见"AI 在做什么的能力，分三层：基础指标（延迟/Token/成本）、链路追踪（Trace）、质量监控（线上抽样评估）。AI 质量会无报错地退化，光监控错误率和延迟不够。详见 [2.9](/ch2-build-products/observability)。

**Ollama**  
在本地电脑上运行大模型的工具，几条命令就能拉模型、跑起来，并对外提供 OpenAI 兼容接口。适合离线、隐私、零成本调试。

**On-demand Injection（按需注入）**  
不一次把所有指令/工具/资料塞满上下文，而是按当前这一步真正需要什么，临时注入、用完撤走。省 token、减干扰。

**One-shot（单样本）**  
在 Prompt 里只给一个示例。

**OpenAI-compatible API（OpenAI 兼容协议）**  
大多数厂商（DeepSeek、通义、智谱、Ollama 等）都提供和 OpenAI 一样格式的接口。结果是换模型只需改 `baseURL`、`apiKey`、`model`，业务代码不变。

**Orchestration（编排）**  
协调多个 Agent 或工具协同工作的过程。

---

## P

**PagedAttention（分页注意力）**  
vLLM 的核心技术：把每个请求占的 KV Cache 像操作系统管内存那样分页管理，碎片浪费极小，同样显存能塞下更多并发。你只需知道它让推理"更省显存、更高并发"。详见 [1.13](/ch1-llm-engineering/self-hosting)。

**Parameter（参数）**  
模型里存储的数值，是训练的结果。"700 亿参数的模型"就是模型里有 700 亿个这样的数字。

**Perplexity（困惑度）**  
衡量模型"预测这段文字有多难"的指标。困惑度越低，说明这段文字对模型来说越"意料之中"，越符合它训练时见过的语言规律。通常用来对比不同模型的语言能力。你在工程里很少直接用到它，但看评测报告会见到。

**Pi**  
一个开源的极简 Agent Harness（minimal agent harness，[pi.dev](https://pi.dev)）。设计哲学是"Primitives, not features"——不内置 Sub-agents、Plan mode 等工作流决策，而是提供 TypeScript 扩展、Skills、Prompt 模板等零件让用户自己组装；特色还有树状会话历史和四种运行模式（交互/Print/RPC/SDK）。详见 [4.17](/ch4-agent-mcp/pi-harness)。

**Plan Tracking（计划追踪）**  
把任务拆成待办清单，做一项勾一项，让 Agent 时刻看见总目标和进度，防止长任务跑偏忘事。Claude Code 的待办清单就是。

**Planning（规划）**  
Agent 在执行任务前制定计划的过程。好的 Planning 能让复杂任务更可控。

**Pre-training（预训练）**  
在大量数据上训练模型的第一阶段，目标是让模型学会语言和知识的基础。

**Prompt（提示词）**  
你给 AI 的输入，包括问题、指令、上下文等一切内容。

**Prompt Injection（提示词注入）**  
通过输入内容覆盖或修改 AI 指令的攻击方式，是 AI 应用的安全威胁之一。

**Prompt Registry（Prompt 注册表）**  
集中管理、版本化、部署 Prompt 的系统。类似代码的 NPM 包注册表，但存的是 Prompt 模板。支持按环境（dev/staging/prod）分发不同版本，支持灰度切换和回滚。典型工具：Langfuse Prompt Management。

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

**Reasoning Model（推理模型）**  
先在内部"思考"再给答案的模型（如 o 系列、DeepSeek-R1、思考模式）。靠 test-time compute 换准确率，难题更强但更慢更贵。

**Regression Test（回归测试）**  
把评估集变成每次改 Prompt/换模型都跑的测试，分数低于基线就拦住上线。AI"代码没动行为也会变"，靠它兜底。详见 [2.10](/ch2-build-products/safe-launch)。

**Reranking / Reranker（重排序）**  
对初步检索结果用更精确的模型（cross-encoder）重新排序，提高检索质量。是"召回不准"时性价比最高的一步（不动索引）；领域术语特殊时还可微调专属 Reranker。详见 [5.18](/ch5-deep-dives/finetuning-retrieval)。

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

**Semantic Cache（语义缓存）**  
将"语义相似"的问题映射到同一个缓存结果的技术。与传统字符串缓存不同，即使用户问法不同（"帮我写封邮件" vs "写一封邮件"），只要语义相近，就命中缓存。通过 Embedding 向量相似度比较实现。→ 见 [2.13](/ch2-build-products/semantic-cache)

**Semantic Search（语义搜索）**  
理解查询意图进行搜索，而不是简单的关键词匹配。

**SFT（Supervised Fine-Tuning，监督微调）**  
用"问题-好回答"配对数据训练模型，让它学会按指令回答。

**Shadow Mode（影子模式）**  
上线策略：新模型先只在后台跑、只记录、不返回给用户，攒真实输入的新旧对比数据，确认更好再切流量。零风险，代价是双倍调用成本。详见 [2.10](/ch2-build-products/safe-launch)。

**SLM（Small Language Model，小语言模型）**  
参数量较小（通常 7B 以下）的语言模型，能在消费级设备上运行。

**Slot Filling（槽位填充）**  
对话系统中，通过多轮追问逐步收集完成任务所需的全部信息的过程。例如订机票需要"出发地""目的地""日期"三个槽位，AI 逐一确认填满。→ 见 2.16

**Softmax**  
把模型内部的原始分数（Logits）转换成"每个词出现概率"的函数，保证所有词的概率加起来等于 1。可以理解为：把"乱序的打分"转换成"规范的百分比"。你不需要实现它，知道它是 Logits 和最终概率之间的转换桥梁即可。

**SOP（Standard Operating Procedure，标准作业流程）**  
本是企业管理术语（工厂、客服都有 SOP），被搬进 Agent 圈，指你写给 Agent 的"标准流程说明书"——把一个反复要做的复杂任务，拆成带判断分支的固定步骤让它照做（"先做 A；遇到 X 就停下来问；否则做 B"）。就像麦当劳后厨墙上贴的"汉堡制作七步法"，新人照着做就不会错；SOP 就是给 Agent 的这张图。让 Agent 稳定干活，往往不是靠更花哨的提示词，而是把人类老手的流程显式写下来。落地形式：写进 System Prompt / `CLAUDE.md`、做成 [Skill](/ch5-deep-dives/skills-intro)、或对确定性步骤直接写成代码。注意 SOP ≠ 一段堆满规则的长提示，关键是写清"什么时候该停、该问、该交接"（呼应 [2.4 Agent 失控](/ch2-build-products/agent-failure)）。

**State Schema（状态模式）**  
工作流/多 Agent 编排中，对跨节点共享状态（State）的字段、类型、读写方、合并方式（Reducer）的显式定义。相当于节点之间的"交接单规格"，是 Graph Engineer 的核心设计对象，直接决定系统是否透明可调试。详见 [4.16](/ch4-agent-mcp/graph-engineering)。

**Stop Sequence（停止序列）**  
当 AI 生成到这个特定字符串时立刻停止输出。

**Streaming（流式输出）**  
AI 生成一个 Token 就立刻发送，而不是等全部生成完再发送。提升用户体验。

**Structured Output（结构化输出）**  
让 AI 输出固定格式的内容，如 JSON，便于程序解析。

**Subagent（子代理）**  
在多 Agent 系统里，由主 Agent 委派执行子任务的 Agent。

**Synthetic Data Generation（合成数据生成）**  
用现有强模型（如 Claude Sonnet）批量生成高质量训练样本，解决标注数据稀缺问题。生成的数据包含输入-输出对，经过质量过滤后用于微调较小模型。2024-2025 年被 Meta、Google、Anthropic 大量采用。

**System Prompt（系统提示）**  
在对话开始前设置的全局指令，告诉 AI 角色、规则、背景信息。

---

## T

**Temperature（温度）**  
控制 AI 输出随机性的参数。低温度 = 稳定保守，高温度 = 创意发散。

**Test-time Compute（推理时计算）**  
在模型"回答时"多花算力去思考，以换取更高准确率，是推理模型的核心思想。和"训练时"投入算力相对。

**Text-to-Image / Text-to-Video（文生图 / 文生视频）**  
根据文字描述生成图片或视频。工程接入不走 chat.completions，国产平台多为"提交任务 → 轮询结果"的异步模式，返回的 URL 通常是临时的。详见 [1.11 图像与视频生成](/ch1-llm-engineering/image-video-gen)。

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

**Trace（链路追踪）**  
给一次完整任务分配一个 traceId，把它背后的多步调用（检索 → 拼 Prompt → 生成 → 工具）串成一棵调用树，出问题能定位是哪一步的锅。是可观测性的第二层。详见 [2.9](/ch2-build-products/observability)。

**Transformer（变换器）**  
当前所有主流大模型的基础架构，2017 年提出，核心是 Attention 机制。

**Tree-of-Thought / ToT（思维树）**  
CoT 的升级版，让 AI 探索多条推理路径，类似"多方案比较"。

**TTS（Text-to-Speech，语音合成）**  
把文字读成语音，是语音对话流水线的"嘴巴"。关键是选音色、用流式边合成边播。声音克隆是合规高敏感区。详见 [1.12 语音与实时](/ch1-llm-engineering/voice-realtime)。

---

## V

**Vector（向量）**  
一组数字，在 AI 里通常指 Embedding 的结果。用来表示文字在语义空间里的位置。

**vLLM**  
生产级开源推理引擎的事实标准，靠连续批处理 + PagedAttention 在同一张显卡上把吞吐拉高几倍到几十倍，并提供 OpenAI 兼容接口。同类有 SGLang、TGI。详见 [1.13](/ch1-llm-engineering/self-hosting)。

**Voice（音色）**  
TTS 里可选的"嗓音"——不同性别、年龄、风格的预置发音人。选一个贴合产品调性的即可。

**Vector Database（向量数据库）**  
专门存储和搜索向量的数据库，支持高效的相似性搜索。

**VLM（Vision Language Model，视觉语言模型）**  
能同时理解图片和文字的模型，如 GPT-4V、Claude 3。

**VRAM（显存）**  
GPU 的内存，运行大模型需要大量 VRAM。

---

## W

**Weight（权重）**  
模型参数的另一种叫法。训练过程中，模型通过不断比对"自己的预测"和"正确答案"，用一种叫"反向传播"（Backpropagation）的算法来调整这些数字，使预测越来越准。反向传播你不需要理解原理，知道"它是训练时自动调整权重的算法"就够了。

**Whisper**  
OpenAI 开源的语音识别（ASR）模型，是开源 ASR 的标杆，可完全本地运行，适合医疗、法务等敏感音频；`whisper.cpp` 在普通笔记本上就能跑。

**Worktree**  
Git 的功能，允许同一个仓库有多个工作目录。Claude Code 用它让 Agent 在隔离环境里工作。

---

## Z

**Zero-shot（零样本）**  
不给任何示例，直接让 AI 完成任务。适合 AI 能理解的标准任务。
