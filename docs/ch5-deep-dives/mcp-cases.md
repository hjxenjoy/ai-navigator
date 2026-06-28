# 5.9 MCP·案例集

把 MCP 落到三个高频场景。每个给：**场景 → 提供哪些能力 → 关键决策（尤其安全）→ 落地要点**。这些都是让 Claude Code 直接接入你公司系统的真实用法。

---

## 案例一：数据库 MCP

**场景**：让 Claude Code 能查你们的业务库——"上周新增了多少用户""订单 ORD-123 什么状态"，不用你手动跑 SQL。

**提供哪些能力**

```
Tool: query_users(filters)      —— 受限的、参数化的查询，不是任意 SQL
Tool: get_order(order_id)       —— 按主键查单条
Resource: schema://tables       —— 把表结构暴露成资源，让 AI 知道有哪些表/字段
```

**关键决策（安全是重点）**
- ❌ **绝不**暴露一个"执行任意 SQL"的工具——等于把数据库裸奔给 AI（+ 注入风险）
- ✅ 暴露**参数化的、受限的具体查询**，参数用 Zod 严格校验（[5.6](./mcp-capabilities)）
- ✅ 用**只读账号**连库（[2.7](/ch2-build-products/security)）；写操作要么不给，要么二次确认
- ✅ 做**用户级数据隔离**：A 用户的 Agent 查不到 B 的数据
- ✅ 查询结果做**行数/字段限制**，别一次性把全表喂进上下文（贵 + 泄露）

**落地要点**：先把"AI 真正需要的几类查询"列出来，每类做成一个受限工具，而不是给通用 SQL 能力。把 schema 作为 Resource 暴露，AI 才知道怎么组合查询。

---

## 案例二：内部 API MCP

**场景**：公司有一堆内部服务（用户中心、工单系统、CRM），想让 Claude Code 能调它们——"给工单 #456 加个备注""查这个客户的套餐"。

**提供哪些能力**

```
Tool: create_ticket_comment(ticket_id, text)
Tool: get_customer_plan(customer_id)
Tool: search_tickets(keyword, status)
```

本质是**给现有内部 API 包一层 MCP 适配**：MCP 工具的 handler 里去调你的内部 HTTP 接口。

**关键决策**
- MCP Server 作为**网关**，统一鉴权（带服务的 token）、统一日志、统一限流
- **写操作**（建工单、改数据）要谨慎：高风险的让 Agent 先说明意图、人确认再执行（呼应 [2.4](/ch2-build-products/agent-failure)）
- 工具粒度别太碎也别太大：一个工具对应一个清晰的业务动作
- 错误处理：内部 API 报错时，把**可读的错误**返回给 Agent，让它能调整（[4.8](/ch4-agent-mcp/harness-engineering)）

**落地要点**：远程部署（[5.7](./mcp-production)）+ OAuth，团队共享一套；用 [4.2 的 `.mcp.json`](/ch4-agent-mcp/use-mcp) 提交进仓库，全员开箱即用。

---

## 案例三：运维 MCP（DevOps）

**场景**：让 AI 帮你做日常运维排查——"看下 api 服务最近的错误日志""这次部署成功了吗""CPU 是不是又飙了"。

**提供哪些能力**

```
Tool: get_logs(service, level, since)    —— 查日志
Tool: get_deploy_status(service)         —— 查部署状态
Tool: get_metrics(service, metric)       —— 查监控指标
Tool: restart_service(service)           —— ⚠️ 危险操作，需确认
```

**关键决策**
- **读操作**（查日志/状态/指标）可以放开；**写/危险操作**（重启、回滚、扩容）严格门禁 + 人工确认
- 日志查询要**带时间窗和级别过滤 + 限量**，否则一查就是几万行塞爆上下文
- 给 Agent 配合 [4.8 错误恢复](/ch4-agent-mcp/harness-engineering)：让它"查日志→定位→给建议"，但**执行修复动作必须你点头**
- 权限按环境分：生产环境的写操作权限收得最紧

**落地要点**：这是"AI 运维助手"的雏形——读类工具让它能自助排查，写类工具全部卡在人工确认。先上读、观察一阵再谨慎开放写。

---

## 三个案例的共性

| 维度 | 经验 |
|-----|------|
| 能力设计 | 都是**受限的具体动作**，不暴露"万能"工具（任意 SQL、任意命令） |
| 读 vs 写 | 读放开、**写谨慎**（高风险操作人工确认） |
| 安全 | 最小权限、参数严格校验、用户级隔离、密钥走环境变量 |
| 上下文 | 查询结果**限量**，别把大结果集塞爆上下文（[4.9](/ch4-agent-mcp/context-engineering)） |
| 部署 | 团队共享走远程 HTTP + OAuth + `.mcp.json`（[5.7](./mcp-production)） |

> ⚠️ MCP 把"AI 能操作你的真实系统"变得很容易，所以**安全边界比功能更重要**。一个设计糟糕的数据库/运维 MCP，等于给 AI 一把能误伤生产的刀。先读后写、最小权限、危险操作确认——这三条是底线。

---

## 🛠️ 实战练习：做一个只读运维 MCP

1. 用 [5.6 高层 SDK](./mcp-capabilities) 做一个 `get_logs(service, level, since)` 工具（先用假数据/读本地日志文件）
2. 严格限制返回行数（如最多 50 行），参数用 Zod 校验
3. 用 [5.7](./mcp-production) 的 Inspector 测通，再挂进 Claude Code，问"看下 api 服务今天的 error 日志"
4. 思考：如果要加 `restart_service`，你会怎么设计确认机制？

**进阶挑战**：把它包成远程 HTTP 服务，加一个最小 token 校验，体会"团队共享的运维助手"形态。

---

## 📌 关键结论

1. 数据库 MCP：暴露受限的参数化查询，绝不给"任意 SQL"；只读账号 + 用户隔离 + 结果限量
2. 内部 API MCP：给现有接口包一层 MCP 网关，统一鉴权日志限流；写操作人工确认
3. 运维 MCP：读类放开让 AI 自助排查，写类（重启/回滚）全部卡人工确认，先读后写
4. 通用底线：受限具体动作、最小权限、读放开写谨慎、结果限量、远程共享走 OAuth
5. MCP 让 AI 能碰真实系统，安全边界比功能更重要——设计糟糕的 MCP 是把误伤生产的刀

---

MCP 深入系列完成 🎉 下一节进入 Skill 开发：[5.10 Skill·究竟是什么](./skills-intro)
