# 2.20 Prompt 版本管理：把 Prompt 当代码来管

大多数团队的 Prompt 管理现状是这样的：

```javascript
// 硬编码在业务代码里
const response = await client.chat.completions.create({
  messages: [{
    role: "system",
    content: "你是一个客服助手，请友好地回答用户问题。"  // 就这一句
  }]
})
```

某天产品经理说"感觉回复太生硬"，开发改成"你是一个热情的客服助手……"，直接推上线。

一周后，客诉率上升，没人知道发生了什么——也没人记得 Prompt 改过。

**Prompt 是 AI 产品最核心的资产，但它却是管理最混乱的那个。**

---

## 为什么 Prompt 需要版本管理

### Prompt 的变更频率远超代码

一个 AI 功能上线后，代码可能几周才动一次，但 Prompt 可能每周都在调——改措辞、改语气、加约束、换例子。每次改动都是风险，但大多数团队对改动一无所知。

### 多环境需求

- **开发环境**：宽松的 Prompt，方便调试
- **Staging**：接近生产的版本，跑测试
- **生产**：经过验证、稳定的版本

没有版本管理，这三个环境很容易不同步，甚至互相覆盖。

### 改动需要可追溯

"上周五 Prompt 改了什么？""谁改的？""为什么改？"——这些问题在出问题时必须能回答。

### A/B 测试能力

想验证新 Prompt 是否真的更好，需要能同时运行两个版本，分配不同比例的流量，对比效果数据。硬编码做不到这点。

> ⚠️ **常见误解**：很多团队以为"Prompt 放在 git 里就算版本管理了"——但如果 Prompt 和业务代码混在同一个文件里，改动很难被独立追踪，更没有热切换能力。

---

## 方案一：基于文件系统（最简单，适合起步）

把 Prompt 从代码中剥离，存为独立的文本文件，放在 `prompts/` 目录下，和代码一起提交 Git。

### 目录结构

```
prompts/
├── support-system.v1.0.txt      ← 初始版本
├── support-system.v1.1.txt      ← 修复了语气问题
├── support-system.v2.0.txt      ← 重写，加了拒答规则
├── summarizer.v1.0.txt
└── summarizer.v1.2.txt
```

### PromptLoader：加载指定版本的 Prompt

```javascript
// prompt-loader.mjs
import fs from "fs"
import path from "path"

class PromptLoader {
  constructor(promptsDir = "./prompts") {
    this.dir = promptsDir
  }

  /**
   * 加载指定 Prompt 的指定版本
   * @param {string} name - Prompt 名称，如 "support-system"
   * @param {string} version - 版本号，如 "2.0"。不传则用最新版
   * @param {object} variables - 变量替换，如 { productName: "我的产品" }
   */
  load(name, version = null, variables = {}) {
    let filePath

    if (version) {
      filePath = path.join(this.dir, `${name}.v${version}.txt`)
    } else {
      // 找最新版本：列出所有匹配文件，按版本号排序取最大
      const files = fs.readdirSync(this.dir)
        .filter(f => f.startsWith(`${name}.v`) && f.endsWith(".txt"))
        .sort()  // 字典序排序，v2.0 > v1.9（注意：只适合简单版本号）

      if (files.length === 0) {
        throw new Error(`找不到 Prompt: ${name}`)
      }

      filePath = path.join(this.dir, files[files.length - 1])
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`Prompt 文件不存在: ${filePath}`)
    }

    let content = fs.readFileSync(filePath, "utf8")

    // 替换变量占位符，如 {{productName}}
    for (const [key, value] of Object.entries(variables)) {
      content = content.replaceAll(`{{${key}}}`, value)
    }

    return content
  }

  // 列出某个 Prompt 的所有版本
  listVersions(name) {
    return fs.readdirSync(this.dir)
      .filter(f => f.startsWith(`${name}.v`) && f.endsWith(".txt"))
      .map(f => f.replace(`${name}.v`, "").replace(".txt", ""))
      .sort()
  }
}

export default PromptLoader
```

### Prompt 文件示例

```
prompts/support-system.v2.0.txt 内容：

你是 {{productName}} 的智能客服助手。

规则：
1. 只回答与 {{productName}} 产品相关的问题
2. 不确定时，引导用户联系人工客服（电话：400-xxx-xxxx）
3. 回复简洁，控制在 200 字以内
4. 遇到退款投诉，优先安抚情绪

语气：专业、友好、不过度热情
```

### 在业务代码里使用

```javascript
// app.mjs
import OpenAI from "openai"
import PromptLoader from "./prompt-loader.mjs"

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const loader = new PromptLoader("./prompts")

async function chat(userMessage) {
  // 加载最新版本，传入变量
  const systemPrompt = loader.load("support-system", null, {
    productName: "我的产品"
  })

  // 如果要固定用某个版本（比如生产环境）：
  // const systemPrompt = loader.load("support-system", "2.0", { productName: "..." })

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage }
    ]
  })

  return response.choices[0].message.content
}

const reply = await chat("我的订单为什么还没发货？")
console.log(reply)
```

这个方案零依赖，立刻可用，Prompt 改动会出现在 git diff 里，Code Review 时一目了然。

---

## 方案二：数据库 Prompt 注册表（生产级）

当团队规模变大、需要热切换（不重启服务改 Prompt）、或需要灰度发布时，文件系统方案就不够了。

### 表结构

```sql
CREATE TABLE prompt_versions (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,     -- Prompt 名称
  version     VARCHAR(20)  NOT NULL,     -- 版本号，如 "2.1.0"
  content     TEXT         NOT NULL,     -- Prompt 内容
  env         VARCHAR(20)  NOT NULL,     -- "dev" / "staging" / "prod"
  is_active   BOOLEAN      DEFAULT false,-- 该环境下是否激活
  description TEXT,                      -- 本次改动说明（类似 commit message）
  created_by  VARCHAR(100),              -- 谁发布的
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- 确保每个 (name, env) 组合只有一个 is_active=true
CREATE UNIQUE INDEX ON prompt_versions (name, env) WHERE is_active = true;
```

### PromptRegistry：注册表操作类

```javascript
// prompt-registry.mjs
import postgres from "postgres"  // npm install postgres

const sql = postgres(process.env.DATABASE_URL)

class PromptRegistry {
  /**
   * 获取指定环境下某个 Prompt 的激活版本
   * @param {string} name - Prompt 名称
   * @param {string} env - 环境："dev" | "staging" | "prod"
   */
  async getActive(name, env) {
    const [row] = await sql`
      SELECT content, version
      FROM prompt_versions
      WHERE name = ${name}
        AND env = ${env}
        AND is_active = true
      LIMIT 1
    `

    if (!row) {
      throw new Error(`没有找到激活的 Prompt: ${name} (${env})`)
    }

    return { content: row.content, version: row.version }
  }

  /**
   * 发布新版本（将该环境的旧版本设为非激活，激活新版本）
   * @param {string} name - Prompt 名称
   * @param {string} version - 版本号
   * @param {string} env - 目标环境
   * @param {string} content - Prompt 内容
   * @param {string} description - 改动说明（必填，类似 commit message）
   * @param {string} createdBy - 发布者
   */
  async publish(name, version, env, content, description, createdBy) {
    await sql.begin(async sql => {
      // 先把旧的激活版本设为非激活
      await sql`
        UPDATE prompt_versions
        SET is_active = false
        WHERE name = ${name} AND env = ${env} AND is_active = true
      `

      // 插入新版本并激活
      await sql`
        INSERT INTO prompt_versions (name, version, env, content, is_active, description, created_by)
        VALUES (${name}, ${version}, ${env}, ${content}, true, ${description}, ${createdBy})
      `
    })

    console.log(`✅ 已发布 ${name} v${version} 到 ${env} 环境`)
  }

  /**
   * 灰度切换：根据用户 ID 决定用哪个版本
   * @param {string} name - Prompt 名称
   * @param {string} userId - 用户 ID
   * @param {number} percentage - 新版本流量比例（0-100）
   * @param {string} newVersion - 新版本号
   */
  async getWithGrayscale(name, userId, percentage, newVersion) {
    // 把用户 ID 哈希成 0-99 的数字
    const hash = this._hashUserId(userId)

    const version = hash < percentage ? newVersion : null
    const env = "prod"

    if (version) {
      const [row] = await sql`
        SELECT content FROM prompt_versions
        WHERE name = ${name} AND env = ${env} AND version = ${version}
        LIMIT 1
      `
      if (row) return { content: row.content, version, isNewVersion: true }
    }

    // 降级到当前激活版本
    const active = await this.getActive(name, env)
    return { ...active, isNewVersion: false }
  }

  // 简单的字符串哈希，将 userId 映射到 0-99
  _hashUserId(userId) {
    let hash = 0
    for (const char of userId) {
      hash = (hash * 31 + char.charCodeAt(0)) & 0xffffffff
    }
    return Math.abs(hash) % 100
  }
}

export default PromptRegistry
```

### 业务代码使用方式

```javascript
// app.mjs
import OpenAI from "openai"
import PromptRegistry from "./prompt-registry.mjs"

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const registry = new PromptRegistry()

async function chat(userId, userMessage) {
  // 灰度：10% 的用户用 v3.0 新版本 Prompt
  const { content: systemPrompt, isNewVersion } = await registry.getWithGrayscale(
    "support-system",
    userId,
    10,       // 10% 流量
    "3.0"     // 新版本号
  )

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage }
    ]
  })

  // 记录是否用了新版本，用于后续效果对比
  if (isNewVersion) {
    console.log(`[灰度] 用户 ${userId} 命中新版 Prompt v3.0`)
  }

  return response.choices[0].message.content
}
```

---

## 方案三：使用 Langfuse（带 UI 的工具方案）

如果不想自己搭数据库，[Langfuse](https://langfuse.com) 提供开箱即用的 Prompt 管理 UI：

- 在 Web 界面直接编辑和发布 Prompt
- 自动版本历史，标注每次改动
- 与 Langfuse 的可观测性功能集成（可以看哪个 Prompt 版本下的用户评分更高）

```javascript
// 通过 Langfuse SDK 拉取最新 Prompt（无需自建数据库）
import { Langfuse } from "langfuse"

const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY
})

const prompt = await langfuse.getPrompt("support-system")
const systemPrompt = prompt.compile({ productName: "我的产品" })
```

Langfuse 适合中小团队快速起步；如果需要完全私有化部署或深度定制，再考虑方案二。

---

## 关键实践

### Prompt 改动必须写"为什么"

类比 git commit message——不写 `fix stuff`，要写 `修复了在用户问退款时回复过于强硬的问题，改为先表达理解再说明流程`。

```javascript
await registry.publish(
  "support-system",
  "2.1",
  "prod",
  newContent,
  "用户反馈回复太生硬：软化了拒绝措辞，加了'理解您的心情'开头",
  "alice@company.com"
)
```

### Prompt 改动配套黄金数据集

每次修改 Prompt，都应该在一批标注好的测试用例上跑一遍，确认指标没有退步。这和 2.17 AI 测试工程里的"黄金数据集评估"直接挂钩——**Prompt 改动 → 自动触发评估 → 通过才能发布到生产**。

### 生产 Prompt 改动走 PR 流程

方案一的文件系统天然支持这一点（Prompt 文件的 PR）。方案二需要在发布脚本上加权限控制，只有 Code Review 通过后才能调用 `publish()` 到 prod 环境。

> 💡 **类比**：Prompt 是 AI 产品的"配方"。没有配方版本管理的餐厅，某天厨师心血来潮换了食材，菜品变难吃了，却完全不知道哪里出了问题。

---

🛠️ 实战练习

**场景**：把你现有项目里硬编码的 Prompt 迁移到文件系统方案，实现版本切换。

**具体步骤**：

1. 在项目根目录创建 `prompts/` 文件夹

2. 把现有 Prompt 存为 `prompts/main-system.v1.0.txt`，在文件开头加一行注释说明这是什么场景

3. 复制并调整 `PromptLoader` 代码到 `prompt-loader.mjs`

4. 修改业务代码，将原来硬编码的字符串替换为：
   ```javascript
   const loader = new PromptLoader("./prompts")
   const systemPrompt = loader.load("main-system")
   ```

5. 创建 `prompts/main-system.v1.1.txt`，做一个小改动（比如改个措辞）

6. 在代码里用 `loader.load("main-system", "1.0")` 和 `loader.load("main-system", "1.1")` 分别调用，对比输出差异

**期望结果**：
- `prompts/` 目录下有两个版本文件
- 代码能通过版本号切换不同的 Prompt，无需修改业务逻辑
- `loader.listVersions("main-system")` 输出 `["1.0", "1.1"]`

---

## 📌 关键结论

1. **Prompt 是核心资产，必须版本化管理**：和代码一样，Prompt 改动需要可追溯、可回滚、可审计——硬编码在代码里是技术债。

2. **三种方案按复杂度递增**：文件系统（起步）→ 数据库注册表（生产级，支持热切换和灰度）→ Langfuse（带 UI，快速落地）。

3. **灰度切换的关键是哈希分流**：基于用户 ID 哈希决定命中比例，保证同一用户每次体验一致，而不是随机跳变。

4. **每次 Prompt 改动配套跑评估**：改 Prompt 就像改算法，要有数据证明"新版比旧版好"，不能靠感觉上线。

下一节：[2.11 实战项目：知识库问答 Agent](./capstone)
