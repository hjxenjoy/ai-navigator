# 2.10 AI 功能安全上线

传统代码改完，测试通过就敢上线。AI 功能不一样：你改了一句 Prompt、或者厂商悄悄更新了模型版本，**代码一行没动，行为却变了**——而且可能是变差。这一节讲怎么让 AI 功能像正经软件一样安全地发布、出问题能秒退。

> 💡 **类比**：调 Prompt 像配药方。你觉得"加一句更清楚的指令"是改进，但它可能在别的场景产生副作用。没有回归测试就上线，等于改了配方直接给所有病人喝——好不好全靠运气。

## 第一道闸：Prompt 回归测试

核心思想很简单：**把"什么样的输入该得到什么样的输出"固定成一个测试集**，每次改 Prompt 或换模型，都跑一遍，看分数有没有下降。这正是 [2.5 评估](./evaluation) 那套方法的工程化落地——评估集不是上线前跑一次就扔，而是变成**每次改动都跑的回归测试**。

```javascript
// 一个最小的 Prompt 回归测试：固定用例 + 跑分 + 和基线对比
const cases = [
  { input: "我要退货", expectIntent: "退货" },
  { input: "东西什么时候到", expectIntent: "物流" },
  { input: "这个能开发票吗", expectIntent: "发票" },
]

async function runSuite(promptVersion) {
  let pass = 0
  for (const c of cases) {
    const intent = await classifyIntent(c.input, promptVersion)   // 你的被测函数
    if (intent === c.expectIntent) pass++
  }
  return pass / cases.length   // 通过率
}

const baseline = await runSuite("v1")   // 当前线上版本
const candidate = await runSuite("v2")  // 改完的新版本
console.log(`基线 ${(baseline * 100).toFixed(0)}%  →  候选 ${(candidate * 100).toFixed(0)}%`)
if (candidate < baseline) throw new Error("新版本质量下降，禁止上线")
```

> ⚠️ 你以为的"小改进"经常在别的用例上翻车。**不留基线对比，你永远不知道是改好了还是改坏了**——这是 AI 工程和"凭感觉调 Prompt"最本质的区别。

---

## 第二道闸：把评估塞进 CI

回归测试只有自动跑才有意义。把它接进 CI（如 GitHub Actions）：**有人改了 Prompt 文件就触发跑分，分数低于基线就 block 这个 PR。**

```yaml
# .github/workflows/prompt-eval.yml（示意）
on:
  pull_request:
    paths: ["prompts/**", "src/llm/**"]   # 只在改了 Prompt/模型相关代码时触发
jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: pnpm run eval   # 跑回归测试，分数不达标就退出码非 0，PR 变红
        env:
          DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}
```

> ⚠️ 评估会真实调用 API、**花钱也花时间**。技巧：用 `paths` 限制只在改了 Prompt/模型相关文件时才跑；测试集别太大（几十条覆盖核心场景即可），nightly 再跑全量大集。

---

## 第三道闸：灰度发布，别一把全量

测试集再全也覆盖不了所有真实输入。新 Prompt / 新模型上线，先放给一小撮流量，用 [2.9 的线上监控](./observability) 对比新旧的质量分、成本、延迟，确认没问题再逐步放大。

```javascript
// 按用户哈希分流，先给 10% 流量用新版本
function pickPromptVersion(userId) {
  const bucket = hashToPercent(userId)   // 把 userId 稳定映射到 0–99
  return bucket < 10 ? "v2" : "v1"       // 同一个用户每次都落同一桶，体验一致
}
```

更稳的做法是**影子模式（Shadow）**：新模型先**只在后台跑、只记录、不返回给用户**，攒一批真实输入的新旧对比数据，确认更好了再真正切流量。零风险，代价是双倍调用成本。

---

## 兜底：版本化 + 一键回滚

把 **Prompt 当代码管**（进 Git，别硬编码在散落各处的字符串里），模型版本也写进配置而不是写死。出问题时，回滚要像改一个配置值那样快——而不是回滚整个服务重新发版。

> ⚠️ 最隐蔽的事故来源：厂商把 `model: "xxx-latest"` 这类**别名**指向的模型悄悄升级了。生产环境尽量**锁定带日期/版本号的具体模型**，把"什么时候升级"的控制权抓在自己手里。

---

## 🛠️ 实战练习：给 Prompt 改动加一道回归闸

为一个分类任务建一个 10 条左右的测试集，写一个脚本：跑当前 Prompt 得基线，改一版 Prompt 再跑，自动对比并在下降时报错退出（退出码非 0，方便接 CI）。

```javascript
import OpenAI from "openai"
const client = new OpenAI({ baseURL: "https://api.deepseek.com", apiKey: process.env.DEEPSEEK_API_KEY })

const cases = [
  { input: "我要退货", expect: "退货" },
  { input: "包裹到哪了", expect: "物流" },
  { input: "能不能便宜点", expect: "价格" },
  { input: "怎么联系人工", expect: "转人工" },
  // ……补到 10 条左右，覆盖核心意图
]

const PROMPTS = {
  v1: "把用户消息分类到：退货/物流/价格/转人工/其他。只输出类别词。",
  v2: "你是客服分类器。判断用户消息属于：退货、物流、价格、转人工、其他。只回类别两个字。",
}

async function runSuite(version) {
  let pass = 0
  for (const c of cases) {
    const res = await client.chat.completions.create({
      model: "deepseek-v4-flash",
      messages: [{ role: "system", content: PROMPTS[version] }, { role: "user", content: c.input }],
      temperature: 0,
    })
    if (res.choices[0].message.content.trim().includes(c.expect)) pass++
  }
  return pass / cases.length
}

const base = await runSuite("v1")
const cand = await runSuite("v2")
console.log(`v1 基线 ${(base * 100).toFixed(0)}%  →  v2 候选 ${(cand * 100).toFixed(0)}%`)
if (cand < base) { console.error("❌ 质量下降，拒绝上线"); process.exit(1) }
console.log("✅ 未下降，可上线")
```

**期望结果**：脚本输出新旧通过率对比；候选更差时以非 0 退出码失败（这样接进 CI 就能自动拦住 PR）。

**进阶挑战**：把 `temperature` 设成默认值再跑几次，观察分数会不会抖动——思考为什么回归测试里分类任务应该把 temperature 设成 0。

---

## 📌 关键结论

1. AI 功能"代码没动行为也会变"——改 Prompt、换模型都可能悄悄变差，必须有回归测试兜底
2. 把评估集变成**每次改动都跑的回归测试**，新版本分数低于基线就禁止上线
3. 把回归测试接进 CI，用 `paths` 限制触发范围控成本；核心集小而精，全量集 nightly 跑
4. 测试覆盖不全靠**灰度发布**补：小流量先行、Shadow 影子模式零风险对比，再逐步放量
5. Prompt 当代码管、模型锁具体版本号（别用 `-latest` 别名），出问题能像改配置一样一键回滚

---

下一节：[2.11 实战项目：从零搭一个知识库问答 Agent](./capstone)
