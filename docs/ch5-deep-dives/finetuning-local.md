# 5.15 微调·本地 LoRA 与 Ollama

数据敏感不能上传、想完全自主、或想白嫖自己的显卡？**本地微调**。这一节用 LoRA 在本地微调一个 Qwen，再导成 GGUF 用 [Ollama](/ch1-llm-engineering/local-models) 跑起来。

## 先回顾：为什么是 LoRA / QLoRA

全量微调要更新模型**所有**参数，几百亿个，普通人玩不起。**LoRA** 只训练额外加的一小撮参数（[3.4](/ch3-under-the-hood/finetuning-vs-rag)），效果接近、成本骤降；**QLoRA** 再叠加量化，显存需求进一步压低。

> 🧩 **比喻**：不重写整本书，只在书页边贴一沓"批注便签"（LoRA adapter，常就 100MB 左右）。用的时候，基座模型 + 这沓便签 = 你的专属模型。

**硬件门槛**（大致）：QLoRA 微调一个 7-8B 模型，**16GB 显存的消费级显卡**就能跑；Mac 用统一内存也行（更慢）。

---

## 两个主流工具

| 工具 | 特点 | 适合 |
|-----|------|-----|
| **LLaMA-Factory** | 零代码，WebUI + CLI，封装了 LoRA/QLoRA/SFT/DPO + 内置评估 | 新手、想少写代码 |
| **Unsloth** | 快（约 2 倍）、省显存（约 -70%），导出 GGUF/Ollama 很顺手 | 显存紧张、追求效率 |

下面以 **LLaMA-Factory** 走主流程（最省心），Unsloth 作为提速替代。

---

## 流程：数据 → 训练 LoRA → 导出 GGUF → Ollama

```
JSONL 数据(5.13) → LoRA 训练 → 合并导出 → 转 GGUF → ollama create → 本地跑
```

**第一步：装工具、备数据**

```bash
pip install llamafactory
# 把 5.13 的 JSONL 放进 data/，并在 data/dataset_info.json 里注册这个数据集
```

**第二步：LoRA 微调（CLI）**

```bash
llamafactory-cli train \
  --stage sft \
  --model_name_or_path Qwen/Qwen2.5-7B-Instruct \
  --dataset my_data \
  --template qwen \                # ⚠️ 模板要和模型匹配，且后面 Ollama 要一致
  --finetuning_type lora \
  --output_dir output/my-lora \
  --num_train_epochs 3 \
  --quantization_bit 4             # QLoRA：4bit 量化，省显存
```

跑完，`output/my-lora` 里就是那沓"批注便签"（LoRA adapter）。

**第三步：合并并导出**

```bash
# 把 LoRA 便签合并回基座，导出成完整模型
llamafactory-cli export \
  --model_name_or_path Qwen/Qwen2.5-7B-Instruct \
  --adapter_name_or_path output/my-lora \
  --export_dir output/merged
```

**第四步：转成 GGUF**（Ollama 吃的格式）

用 llama.cpp 的转换脚本把 `merged` 转成 GGUF，并量化（`q4_k_m` 是常用档，体积小、质量够）。

**第五步：用 Ollama 跑起来**

```dockerfile
# Modelfile
FROM ./output/my-model.gguf
# ⚠️ 模板必须和训练时一致（qwen 模板），否则输出会乱
TEMPLATE """{{ if .System }}<|im_start|>system
{{ .System }}<|im_end|>
{{ end }}<|im_start|>user
{{ .Prompt }}<|im_end|>
<|im_start|>assistant
"""
```

```bash
ollama create my-qwen -f Modelfile
ollama run my-qwen "把这条反馈分类：登录页打不开"
```

跑起来后，它就是个本地 OpenAI 兼容服务，用 [1.10](/ch1-llm-engineering/local-models) 的方式调用即可。

---

## 最大的坑：chat template 不一致

> ⚠️ **本地微调最常见的翻车点**：训练时用的对话模板（如 qwen 的 `<|im_start|>` 那套），和 Ollama 里 Modelfile 的 `TEMPLATE` **必须一致**。不一致 → 模型输出乱码或答非所问。训练用 `--template qwen`，Ollama 就也得用 qwen 模板。

> 💡 Unsloth 在这块更省心：它能直接 `save_pretrained_gguf` 导出，甚至帮你生成对应的 Ollama Modelfile，减少模板对不上的风险。

---

## 本地 vs 云端微调

| | 本地（LoRA） | 云端（5.14） |
|--|-----------|-----------|
| 数据隐私 | 不出本机 ✅ | 要上传 |
| 硬件 | 要 GPU/显存 | 不用 |
| 自主度 | 完全自主 | 受平台限制 |
| 上手 | 要配环境、踩模板坑 | 点几下就好 |

> 敏感数据 / 要完全掌控 / 有显卡 → 本地；图省事、没 GPU → 云端。

---

## 🛠️ 实战练习：本地微调 + Ollama 跑起来

用 [5.13](./finetuning-workflow) 的数据集（先用小数据、小模型如 Qwen2.5-7B 试通流程）：

1. 装 LLaMA-Factory，注册数据集
2. 跑一次 QLoRA 训练（epoch 设 1-2，先把流程跑通）
3. 合并导出 → 转 GGUF → 写 Modelfile（**模板对齐**）→ `ollama create`
4. `ollama run` 测几条，对比微调前后的 Qwen 在你任务上的差别

**期望结果**：你完整体验一遍"数据→LoRA→GGUF→Ollama"，并亲历"模板必须一致"这个坑。

**进阶挑战**：把这个本地微调模型接进 [2.9 的 Capstone](/ch2-build-products/capstone) 或 [5.5 案例](./rag-cases)，做一个完全离线、且在你专项任务上更准的版本。

---

## 📌 关键结论

1. 本地微调用 LoRA/QLoRA：只训一小撮参数（百MB 的 adapter），16GB 显存就能搞 7-8B
2. 工具：LLaMA-Factory 零代码省心；Unsloth 更快更省显存、导出 Ollama 更顺
3. 流程：JSONL → LoRA 训练 → 合并导出 → 转 GGUF → ollama create → 本地跑
4. 最大的坑：训练和 Ollama 的 chat template 必须一致，否则输出乱
5. 敏感数据/要自主/有显卡 → 本地；图省事/没 GPU → 云端（5.14）

---

下一节：[5.16 微调·案例集与决策](./finetuning-cases)
