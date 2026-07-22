# 4.14 多模态 Agent：视觉理解 + 行动

Agent 不只是"读文字、调工具"。当你给 Agent 接上视觉能力，它能看截图、看图表、看 UI 界面，然后决定下一步动作。这是当前 Agent 能力扩展最快的方向之一。

---

## 为什么多模态对 Agent 很重要

文字 Agent 的局限：很多现实任务的输入就是**图像**，无法用文字完整描述。

```
典型场景：
  - 看截图报告 UI bug："第三行按钮文字截断了"
  - 分析图表数据："这张折线图的趋势是什么"
  - 验证表单填写结果："帮我确认这个表格填对了吗"
  - 网页抓取+理解："打开这个页面，告诉我价格是多少"
  - 图片审核："这张用户头像是否合规"
```

把视觉理解纳入 Agent 循环，就能处理这类任务。

---

## 多模态 API 基础

主流模型（Claude、GPT-4o）都支持图像输入：

```javascript
import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// 方式一：Base64 编码（适合本地文件）
async function analyzeImage(imagePath, question) {
  const imageData = fs.readFileSync(imagePath).toString('base64')
  const ext = imagePath.split('.').pop().toLowerCase()
  const mediaTypes = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' }

  const res = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaTypes[ext], data: imageData }
        },
        { type: 'text', text: question }
      ]
    }]
  })

  return res.content[0].text
}

// 方式二：URL（适合网络图片）
async function analyzeImageUrl(imageUrl, question) {
  const res = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'url', url: imageUrl } },
        { type: 'text', text: question }
      ]
    }]
  })
  return res.content[0].text
}
```

---

## 多模态 Agent 的工具设计

把"分析图像"封装成 Agent 可调用的工具：

```javascript
const tools = [
  {
    name: 'analyze_screenshot',
    description: '分析截图，回答关于图像内容的问题',
    input_schema: {
      type: 'object',
      properties: {
        image_path: { type: 'string', description: '截图的本地路径' },
        question: { type: 'string', description: '关于这张截图要回答的问题' }
      },
      required: ['image_path', 'question']
    }
  },
  {
    name: 'extract_table_from_image',
    description: '从图像中提取表格数据，返回结构化 JSON',
    input_schema: {
      type: 'object',
      properties: {
        image_path: { type: 'string' },
        table_description: { type: 'string', description: '表格的大致描述（帮助 AI 定位）' }
      },
      required: ['image_path']
    }
  },
  {
    name: 'compare_screenshots',
    description: '对比两张截图，找出差异',
    input_schema: {
      type: 'object',
      properties: {
        before_path: { type: 'string', description: '对比前的截图路径' },
        after_path: { type: 'string', description: '对比后的截图路径' }
      },
      required: ['before_path', 'after_path']
    }
  }
]

// 工具执行函数
async function executeTool(toolName, toolInput) {
  switch (toolName) {
    case 'analyze_screenshot': {
      return await analyzeImage(toolInput.image_path, toolInput.question)
    }

    case 'extract_table_from_image': {
      const result = await analyzeImage(
        toolInput.image_path,
        `请将图中的表格数据提取为 JSON 数组，每行是一个对象，key 是列名。
如果无法识别表格，返回 {"error": "no table found"}。
只输出 JSON，不要其他文字。`
      )
      try {
        return JSON.parse(result)
      } catch {
        return { raw: result }
      }
    }

    case 'compare_screenshots': {
      // Claude 支持同一个请求里放多张图片
      const beforeData = fs.readFileSync(toolInput.before_path).toString('base64')
      const afterData = fs.readFileSync(toolInput.after_path).toString('base64')

      const res = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: '请对比这两张截图，列出所有可见的差异：' },
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: beforeData } },
            { type: 'text', text: '↑ 第一张（变更前）' },
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: afterData } },
            { type: 'text', text: '↑ 第二张（变更后）' },
          ]
        }]
      })
      return res.content[0].text
    }
  }
}
```

---

## 完整的多模态 Agent 循环

```javascript
async function runMultimodalAgent(taskDescription, availableTools = tools) {
  const messages = [{ role: 'user', content: taskDescription }]

  while (true) {
    const res = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      tools: availableTools,
      messages
    })

    // 把 AI 响应加入历史
    messages.push({ role: 'assistant', content: res.content })

    if (res.stop_reason === 'end_turn') {
      // 完成，提取最后的文字输出
      const textBlock = res.content.find(b => b.type === 'text')
      return textBlock?.text ?? '完成'
    }

    if (res.stop_reason === 'tool_use') {
      // 执行所有工具调用
      const toolResults = []
      for (const block of res.content) {
        if (block.type !== 'tool_use') continue

        console.log(`调用工具：${block.name}`, block.input)
        let result
        try {
          result = await executeTool(block.name, block.input)
        } catch (err) {
          result = { error: err.message }
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: typeof result === 'string' ? result : JSON.stringify(result)
        })
      }

      messages.push({ role: 'user', content: toolResults })
    }
  }
}

// 使用示例
const task = `
我们的登录页在 /screenshots/login.png。
请帮我检查：
1. 按钮文字是否完整，没有被截断
2. 错误提示区域是否存在
3. 整体布局是否正常
报告发现的任何 UI 问题。
`
const report = await runMultimodalAgent(task)
console.log(report)
```

---

## 实用场景：图表数据提取 Agent

```javascript
// 从一批业务截图里自动提取 KPI 数据
async function extractKPIsFromDashboard(screenshotPath) {
  const result = await analyzeImage(screenshotPath, `
请从这张仪表盘截图中提取所有指标数据，以 JSON 格式返回。
例如：{"DAU": "12.4万", "转化率": "3.2%", "收入": "¥245,000"}
只输出 JSON。
  `)

  try {
    return JSON.parse(result)
  } catch {
    // 如果 JSON 解析失败，用结构化输出重试
    const retry = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png',
              data: fs.readFileSync(screenshotPath).toString('base64') } },
          { type: 'text', text: `提取所有数字指标，只输出合法 JSON 对象` }
        ]
      }]
    })
    return JSON.parse(retry.content[0].text)
  }
}
```

---

## 多图对比：版本比对 Agent

```javascript
// 给定"改动前后"两个版本的截图目录，自动生成 diff 报告
async function generateVisualDiffReport(beforeDir, afterDir) {
  const files = fs.readdirSync(beforeDir).filter(f => f.endsWith('.png'))
  const diffs = []

  for (const file of files) {
    const beforePath = path.join(beforeDir, file)
    const afterPath = path.join(afterDir, file)
    if (!fs.existsSync(afterPath)) {
      diffs.push({ page: file, diff: '新版本中此页面不存在' })
      continue
    }

    const diffResult = await executeTool('compare_screenshots', {
      before_path: beforePath,
      after_path: afterPath
    })

    diffs.push({ page: file, diff: diffResult })
  }

  return diffs
}
```

---

## 成本与限制

| 关注点 | 说明 |
|-------|------|
| **Token 计费** | 图像按像素折算 Token。Claude 中一张 1024×1024 图约消耗 1600 token |
| **分辨率上限** | Claude 最大支持 8000×8000 像素，超出会自动缩小 |
| **每次请求图片数** | Claude 最多 20 张图/请求 |
| **不适合的任务** | 精确像素测量、颜色值读取（用代码工具更准） |

```javascript
// 控制图片大小以降低成本
import sharp from 'sharp'

async function resizeForAI(imagePath, maxWidth = 1920) {
  const outputPath = imagePath.replace(/\.(\w+)$/, '_resized.$1')
  await sharp(imagePath)
    .resize(maxWidth, undefined, { withoutEnlargement: true })
    .toFile(outputPath)
  return outputPath
}
```

> ⚠️ **常见误解**：视觉 AI 不是"像素精确"的——它的强项是**理解内容和语义**，而不是测量精确位置或颜色值。需要像素级精确操作时，用 Computer Use（见 4.11）或传统图像处理库。

---

## 🛠️ 实战练习：截图分析 Agent

1. 对你的产品任意一个页面截图（或找一张 UI 截图）
2. 实现 `analyze_screenshot` 工具，让 Agent 回答以下问题：
   - 页面主要功能是什么
   - 有没有明显的 UI 问题（截断、溢出、对齐错误）
   - 交互元素（按钮、链接）有哪些
3. 用上面的 `runMultimodalAgent` 函数跑一遍

**期望结果**：Agent 能描述截图内容、识别 UI 组件，并报告任何可见问题。

**进阶挑战**：准备"修复前"和"修复后"两张截图，用 `compare_screenshots` 工具让 Agent 自动验证 bug 是否被修复。

---

## 📌 关键结论

1. 给 Agent 接上图像输入，就能处理"输入本身是图片"的现实任务（截图、图表、扫描件）
2. 把视觉理解封装成工具（Tool），让 Agent 自主决定什么时候需要"看图"
3. 同一请求可传多张图，适合版本对比、多页分析
4. 视觉 AI 的强项是语义理解，不是像素精确——精确操作用 Computer Use
5. 图像按 Token 计费，高分辨率图会快速消耗 Token——建议先压缩再发送

---

下一节：[4.15 AI 工程师的角色演进：从 Prompter 到 Graph Engineer](./engineer-roles)
