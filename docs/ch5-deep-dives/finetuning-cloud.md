# 5.14 微调·用国产平台云端微调

不想搞 GPU、不想配环境？**云端微调**最省事：上传数据、点开始、等结果、当新模型调用。这一节用阿里百炼走一遍端到端（智谱等平台流程类似）。

## 云端微调适合谁

```
你有：几百~几千条标注数据 + 一个固定任务
你没有：GPU、显存、配环境的耐心
        → 云端微调：把数据交给平台，它替你训
```

代价是数据要上传到平台、按训练时长/token 计费。**敏感数据**或要**完全自主**的，看 [5.15 本地微调](./finetuning-local)。

> 百炼支持三种调优：**SFT**（最常用，监督微调）、CPT（继续预训练）、DPO（偏好对齐）。一般任务用 SFT。

---

## 端到端流程（百炼）

```
① 准备 JSONL 数据（5.13）
② 上传训练文件 → 拿到 file_id
③ 创建调优任务（指定基座模型、file_id、超参、训练类型）
④ 轮询任务状态（PENDING → RUNNING → SUCCEEDED）
⑤ 部署微调产出的模型
⑥ 用 OpenAI 兼容接口调用你的专属模型
```

百炼有两条路：**控制台点点点**（最简单，适合第一次）和 **API**（适合自动化/批量）。下面讲 API 路径，控制台路径是把这些步骤变成网页操作。

> ⚠️ 微调 API 的具体端点和 SDK 方法各平台不同、也会更新——下面给的是**流程和关键字段**，具体调用以[百炼最新文档](https://help.aliyun.com/zh/model-studio/fine-tuning-api-guide)为准，别照抄 URL。

**第二步：上传数据文件**

```javascript
// 鉴权用 DASHSCOPE_API_KEY（和你做 Embedding 那个是同一个）
// 上传 JSONL，拿到 file_id（用于建任务）
const form = new FormData()
form.append("file", new Blob([jsonlText]), "train.jsonl")
// POST 到百炼的文件上传端点（见文档）→ 返回 { file_id }
```

**第三步：创建调优任务**——关键字段：

```javascript
const job = {
  model: "qwen-plus",                  // 基座模型
  training_file_ids: [fileId],         // 上传的训练文件
  validation_file_ids: [valFileId],    // 验证集（可选但强烈建议）
  training_type: "sft",                // sft / cpt / dpo
  hyper_parameters: { n_epochs: 3 }    // 起步用默认/少量 epoch
}
// POST 创建任务 → 返回 { job_id }
```

**第四步：轮询状态**

```javascript
// 每隔一段时间查一次，直到 SUCCEEDED 或 FAILED
// GET job/{job_id} → { status: "RUNNING", finetuned_output: null }
//                  → { status: "SUCCEEDED", finetuned_output: "<你的专属模型名>" }
```

**第五步：部署**——训练出的模型要部署后才能调用（控制台一键部署，或 API 部署）。

**第六步：调用你的专属模型**——和调普通模型一模一样（[1.9 OpenAI 兼容](/ch1-llm-engineering/openai-compatible)），只是 `model` 换成你的微调模型名：

```javascript
import OpenAI from "openai"
const client = new OpenAI({
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  apiKey: process.env.DASHSCOPE_API_KEY
})
const res = await client.chat.completions.create({
  model: "ft-你的专属模型名",          // ← 换成微调产出的模型
  messages: [
    { role: "system", content: "你是合同分类助手，只输出类别" },  // 和训练时保持一致！
    { role: "user", content: "甲方向乙方采购办公设备一批……" }
  ]
})
// 期望直接输出 "购销合同"
```

> ⚠️ **调用时的 system prompt 要和训练数据里的一致**，否则模型行为会漂。这是云端微调最常见的"训练好了但用起来不对"的原因。

---

## 评估与迭代

部署后，用 [5.13](./finetuning-workflow) 留出的验证集 + [2.5](/ch2-build-products/evaluation) 的方法量化：

```
微调前 qwen-plus（仅 Prompt）：分类准确率 80%
微调后 ft-模型：             分类准确率 95%   ✅
```

不满意就回去**补数据、修标注、调 epoch**，再训一轮——微调是迭代出来的，不是一次成的。

---

## 成本与取舍

- 计费：训练（按数据量/时长）+ 部署/调用。一次小数据集 SFT 通常不贵，但**部署常驻**可能有持续费用，注意看计费说明。
- 先算账：如果 [Prompt + Few-shot](/ch1-llm-engineering/prompt-engineering) 或 RAG 已能到可接受效果，未必值得微调（[3.4](/ch3-under-the-hood/finetuning-vs-rag)）。微调的价值在"稳定的格式/风格/专项准确率"。

---

## 🛠️ 实战练习：云端微调一个分类模型

用 [5.13](./finetuning-workflow) 造的分类数据集：

1. 整理成 JSONL（训练集 + 验证集），按百炼文档上传
2. 控制台或 API 建一个 SFT 任务，基座选 qwen 系列，epoch 用默认
3. 等训练完、部署
4. 用验证集对比"微调前 vs 微调后"的准确率
5. 调用时确认 system prompt 和训练时一致

**进阶挑战**：把准确率没达标的样本拎出来，分析是数据不够还是标注不一致，补数据再训一轮，看数字能不能再上去。

---

## 📌 关键结论

1. 云端微调最省事：上传数据 → 建任务 → 部署 → 当新模型调用，无需 GPU
2. 百炼流程：上传 JSONL 拿 file_id → 创建 SFT 任务 → 轮询到 SUCCEEDED → 部署 → 调用
3. 具体端点会变，认准流程和字段，URL 以平台最新文档为准
4. 调用时 system prompt 必须和训练时一致，否则行为漂移
5. 微调是迭代出来的：评估不达标就补数据/修标注/调 epoch 再训；敏感数据考虑本地微调

---

下一节：[5.15 微调·本地 LoRA 与 Ollama](./finetuning-local)
