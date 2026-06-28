# 1.11 图像与视频生成

[1.8](./multimodal) 讲的是让模型"看"图——那是**输入**。这一节讲反过来：让模型"画"图、"拍"视频——这是**输出**。同样是工程接入，但有几个和文本生成完全不同的脾气，不踩坑就用不好。

## 文生图能干什么活

抛开"生成壁纸"这类玩票场景，工程上真正有价值的是：

- **配图自动化**：电商商品图、营销 Banner、文章封面，批量出图
- **占位图 / 草稿稿**：产品原型阶段先用 AI 出视觉草稿，省设计排期
- **图生图（改图）**：给一张原图 + 一句指令（"换成夜景""去掉背景路人"），做局部编辑
- **风格统一**：给定参考图，批量生成同一风格的系列素材

> 💡 **类比**：文本模型是"逐字往下写"，图像模型更像"从一团噪点里慢慢擦出一张图"——它不是一笔一笔画，而是一次次把模糊的雾擦清晰。所以你**没法像文字那样精确控制每个像素**，只能用提示词和参数去"引导"它往哪个方向擦。你不需要理解扩散（Diffusion）的具体原理，记住"引导而非命令"这个手感就够。

---

## 工程接入：和聊天 API 不是一个接口

⚠️ **第一个反直觉点**：文生图**不走** `chat.completions`。它是另一类 API，国产平台基本都是"提交任务 → 轮询结果"的**异步**模式（出图要几秒到几十秒，不可能让 HTTP 一直挂着等）。

以阿里百炼（通义万相）为例，典型流程是两步：

```javascript
// 注意：文生图不是 OpenAI 兼容协议，用各平台自己的 SDK / REST 接口
// 下面用原生 fetch 演示通义万相的「提交 + 轮询」异步模式

const BASE = "https://dashscope.aliyuncs.com/api/v1"
const headers = {
  "Authorization": `Bearer ${process.env.DASHSCOPE_API_KEY}`,
  "Content-Type": "application/json",
  "X-DashScope-Async": "enable",   // 关键：声明异步任务
}

// 第 1 步：提交生成任务，拿到 task_id
const submit = await fetch(`${BASE}/services/aigc/text2image/image-synthesis`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    model: "wanx-v1",            // 通义万相文生图模型
    input: { prompt: "一只戴宇航头盔的柴犬，写实风格，蓝色背景" },
    parameters: { size: "1024*1024", n: 1 },   // 尺寸、出几张
  }),
})
const { output } = await submit.json()
const taskId = output.task_id

// 第 2 步：轮询任务结果，直到 SUCCEEDED
async function poll(id) {
  while (true) {
    const r = await fetch(`${BASE}/tasks/${id}`, { headers })
    const data = await r.json()
    const status = data.output.task_status
    if (status === "SUCCEEDED") return data.output.results.map(x => x.url)
    if (status === "FAILED") throw new Error("生成失败: " + JSON.stringify(data.output))
    await new Promise(res => setTimeout(res, 2000))   // 等 2 秒再查
  }
}

const urls = await poll(taskId)
console.log("出图地址：", urls)   // 注意：URL 通常是临时的，要尽快下载转存
```

> ⚠️ **出图 URL 是临时的**。平台返回的图片链接一般有几小时到一天的有效期，别直接存进数据库当永久地址——拿到后立刻下载，转存到你自己的对象存储（OSS/S3）。

**视频生成**（如通义万相文生视频、可灵）同理，只是更慢（几十秒到几分钟）、更贵，轮询间隔可以放大到 5~10 秒。流程完全一样：提交任务 → 拿 task_id → 轮询。

---

## 提示词：图像和文本不是一套写法

文本提示词讲究"逻辑和约束"，图像提示词讲究"堆描述性关键词"。一条好用的文生图提示词通常按这个结构堆：

```
主体 + 细节 + 风格 + 镜头/光线 + 画质词
例：一只柴犬 + 戴宇航头盔、表情好奇 + 写实摄影风格 + 微距镜头、柔和侧光 + 高细节、8k
```

几个和文本完全不同的要点：

- **负向提示词（Negative Prompt）**：很多平台支持单独传"不想要什么"（如 `低质量, 多余的手指, 模糊`），这是修瑕疵的主力旋钮，文本生成里没有对应概念
- **加权**：部分平台支持给关键词加权重（让某个元素更突出），具体语法看平台文档
- **可复现性**：和文本一样有 `seed`——同样的提示词 + 同样的 seed ≈ 同样的图，调图时锁定 seed 再微调提示词，否则每次都是新图没法比较

---

## 成本与合规：比文本更要当心

⚠️ 文生图/视频**按张/按秒计费**，比文本贵得多，而且失败的任务有时也算钱。工程上要注意：

- **别让用户无限刷图**：加频率限制和每日额度，否则成本会失控
- **内容审核是硬要求**：国产平台对生成内容有合规审核，涉政/涉黄/侵权的提示词会被拒。面向用户的产品，你自己也要在提交前做一道提示词过滤
- **版权与水印**：生成图的商用授权各平台政策不同，落地前务必看清；部分平台会强制加 AI 水印（这也是合规要求）

---

## 🛠️ 实战练习：批量出图 + 自动转存

写一个脚本，给定一组商品描述，批量生成配图并下载到本地。

```javascript
import { writeFileSync } from "fs"

const BASE = "https://dashscope.aliyuncs.com/api/v1"
const headers = {
  "Authorization": `Bearer ${process.env.DASHSCOPE_API_KEY}`,
  "Content-Type": "application/json",
  "X-DashScope-Async": "enable",
}

async function genImage(prompt) {
  const submit = await fetch(`${BASE}/services/aigc/text2image/image-synthesis`, {
    method: "POST", headers,
    body: JSON.stringify({
      model: "wanx-v1",
      input: { prompt },
      parameters: { size: "1024*1024", n: 1 },
    }),
  })
  const taskId = (await submit.json()).output.task_id

  while (true) {
    const data = await (await fetch(`${BASE}/tasks/${taskId}`, { headers })).json()
    if (data.output.task_status === "SUCCEEDED") return data.output.results[0].url
    if (data.output.task_status === "FAILED") throw new Error("失败: " + taskId)
    await new Promise(r => setTimeout(r, 2000))
  }
}

const products = [
  "极简风格的白色陶瓷马克杯，纯色背景，电商主图",
  "复古机械键盘特写，暖色灯光，木质桌面",
]

for (const [i, p] of products.entries()) {
  const url = await genImage(p)
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
  writeFileSync(`./product-${i}.png`, buf)   // 立刻转存，别依赖临时 URL
  console.log(`已保存 product-${i}.png`)
}
```

**观察要点：**
- 同一段提示词跑两次，出的图是否一样？（默认不锁 seed 时每次都不同）
- 给提示词补上"镜头/光线/画质词"后，出图质量提升明显吗？

**进阶挑战**：给脚本加一个"负向提示词"参数（如 `低质量, 水印`），对比加与不加的成片差异；再加一层简单的提示词敏感词过滤，拒绝明显违规的输入。

---

## 📌 关键结论

1. 文生图/视频是**输出**侧的多模态，和 1.8 的图像**输入**是两回事
2. 接口**不走 chat.completions**，国产平台基本是"提交任务 → 轮询 task_id"的异步模式，视频更慢更贵
3. 出图/视频的返回 URL 是**临时**的，拿到立刻下载转存到自己的对象存储
4. 图像提示词靠堆描述（主体+细节+风格+镜头+画质词），还有文本没有的**负向提示词**和 seed 锁定
5. 按张/按秒计费、远贵于文本，且有内容合规审核——产品里必须加限额、提示词过滤，并确认商用授权与水印政策

---

下一节：[1.12 语音与实时：让 AI 能听会说](./voice-realtime)
