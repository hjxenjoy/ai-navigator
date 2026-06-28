# 1.8 多模态：图像与文档输入

到现在为止，我们的输入都是纯文字。但主流模型大多是**多模态（Multimodal）**的——能"看"图片、读截图、理解 PDF。这一节讲怎么在工程里用上它。

> 本节讲多模态**输入**（让模型读图/读文档）。反过来的多模态**输出**——让模型生成图像/视频、能听会说——见 [1.11 图像与视频生成](./image-video-gen) 和 [1.12 语音与实时](./voice-realtime)。

## 多模态能做什么

- **截图调试**：把报错截图、UI 异常截图直接发给 AI，让它定位问题
- **看图写代码**：给一张设计稿，让 AI 生成对应的页面代码
- **文档理解**：把 PDF、扫描件、表格图片转成结构化数据
- **OCR + 理解**：不只是识别文字，还能理解图里的内容（"这张发票的总金额是多少"）
- **图表解读**：让 AI 读懂一张数据图表说了什么

> 💡 **类比**：以前 AI 是个只能听你"念"的助手，现在它能直接"看"你递过去的纸——很多原本要你先描述一遍的事，现在直接给图就行。

---

## 图片是怎么传给模型的

在 OpenAI 兼容协议里，图片作为消息内容的一部分传入。一条消息的 `content` 从一个字符串变成一个**数组**，里面混合文字和图片：

```javascript
const response = await client.chat.completions.create({
  model: MODEL,   // 要用支持视觉的模型（多数主流模型都支持）
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "这张截图里的报错是什么原因？怎么修？" },
        {
          type: "image_url",
          image_url: { url: "https://example.com/error-screenshot.png" }
        }
      ]
    }
  ]
})
console.log(response.choices[0].message.content)
```

**传本地图片**：用 Base64 编码，拼成 Data URL：

```javascript
import { readFileSync } from "fs"

const base64 = readFileSync("./screenshot.png").toString("base64")
const dataUrl = `data:image/png;base64,${base64}`

// 然后把上面的 image_url.url 换成 dataUrl
```

---

## 成本要注意：图片很"贵"

⚠️ 图片不是按"一张"算钱，而是**按它折算成多少 Token 算钱**。一张高分辨率图片可能相当于几百上千个 Token。

省钱要点：
- **压缩 / 缩小图片**：很多任务不需要原图分辨率，缩小后照样能看清关键内容
- **裁剪**：只截取相关区域，别把整个屏幕都发过去
- **能用文字就别用图**：如果信息本来是文字（比如日志），直接贴文字比截图便宜得多

---

## 文档（PDF）怎么处理

PDF 有两种思路：

1. **直接传给支持文档的模型**：部分模型/平台支持直接上传 PDF，它内部会处理分页和图文。
2. **自己先抽取再喂文字**：用库（如 `pdf-parse`）把 PDF 文字抽出来，当普通文本发给模型。**纯文字 PDF 用这种最便宜**；只有扫描件、复杂版式、需要看图表时才用多模态。

> ⚠️ 不要默认"PDF 就得用多模态"。如果是可复制文字的 PDF，抽成文本再处理，成本低一个数量级。

---

## 🛠️ 实战练习：截图问诊

找一张你最近遇到的**报错截图**（或随便截一张代码报错），用多模态发给 AI：

```javascript
import { readFileSync } from "fs"
import OpenAI from "openai"

// 注意：要用支持视觉的模型。DeepSeek 当前以文本为主，
// 视觉任务可用阿里百炼的 qwen-vl 系列，或本地 Ollama 的 llava / qwen2.5-vl
const client = new OpenAI({
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  apiKey: process.env.DASHSCOPE_API_KEY
})

const base64 = readFileSync("./error.png").toString("base64")

const res = await client.chat.completions.create({
  model: "qwen-vl-plus",   // 视觉模型
  messages: [{
    role: "user",
    content: [
      { type: "text", text: "这是什么报错？最可能的原因和修复方法是什么？" },
      { type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } }
    ]
  }]
})
console.log(res.choices[0].message.content)
```

**观察要点：**
- AI 能不能准确读出截图里的报错文字？
- 把同一张图缩小一半再发，token 用量降了多少？回答质量有没有变差？

**进阶挑战**：找一张设计稿截图，让 AI 生成对应的 HTML/CSS，看看离能用差多远。

---

## 📌 关键结论

1. 多模态让 AI 能"看"图：截图调试、设计稿转代码、文档理解、图表解读
2. 图片在 OpenAI 协议里作为 `content` 数组里的 `image_url` 传入，本地图用 Base64 Data URL
3. 图片按折算 Token 计费，很贵——压缩、裁剪、能用文字就别用图
4. 纯文字 PDF 先抽文本再处理，比直接走多模态便宜得多
5. 视觉任务要选支持视觉的模型（如 qwen-vl、llava），纯文本模型不行

---

下一节：[1.9 OpenAI 兼容协议与多模型切换](./openai-compatible)
