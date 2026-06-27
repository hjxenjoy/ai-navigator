# 部署与离线阅读

这份文档是纯静态站点，部署到 Cloudflare Pages 后，手机随时能看，还能离线复习。

## 部署到 Cloudflare Pages

**方式一：连 Git 仓库（推荐，改了自动重新部署）**

1. 把仓库推到 GitHub / GitLab
2. Cloudflare 控制台 → Workers & Pages → Create → Pages → 连接你的仓库
3. 构建配置填：

| 配置项 | 值 |
|-------|----|
| 框架预设（Framework preset） | None（或 VitePress，若有） |
| 构建命令（Build command） | `pnpm build` |
| 构建输出目录（Build output directory） | `docs/.vitepress/dist` |

4. 保存并部署，几十秒后给你一个 `xxx.pages.dev` 网址

> 💡 Cloudflare 看到仓库里的 `pnpm-lock.yaml` 会自动用 pnpm 安装依赖。如果构建报 Node 版本相关错误，在 Pages 的环境变量里加 `NODE_VERSION = 20`。

**方式二：命令行直接传（Wrangler）**

```bash
pnpm build
npx wrangler pages deploy docs/.vitepress/dist
```

适合不想连 Git、手动发布的场景。

---

## 离线阅读（PWA）

这个站点已经配成 **PWA（渐进式 Web 应用）**。效果：

- **离线可读**：你在线访问过的页面会被缓存，之后断网（地铁、飞机）也能打开复习
- **加到主屏**：手机浏览器菜单里选"添加到主屏幕"，它会像个 App 一样有图标、全屏打开
- **自动更新**：你重新部署后，下次联网打开会在后台静默更新到最新内容

**怎么用（手机）：**
1. 用浏览器打开你的 `xxx.pages.dev`
2. iOS Safari：分享 → 添加到主屏幕；Android Chrome：菜单 → 添加到主屏幕 / 安装应用
3. 之后从主屏图标进入，浏览过的内容断网也能看

> ⚠️ 离线缓存的是**你访问过的页面**。想让某章能离线看，先在线点开过一次。第一次安装后建议把想复习的章节都翻一遍，缓存下来。

---

## 本地预览部署产物

推送前想看看构建出来的样子：

```bash
pnpm build       # 产物在 docs/.vitepress/dist
pnpm preview     # 本地起服务预览，端口 5847
```

---

## 📌 关键结论

1. Cloudflare Pages 部署：构建命令 `pnpm build`，输出目录 `docs/.vitepress/dist`
2. 连 Git 仓库后，每次 push 自动重新部署
3. 已配 PWA：访问过的页面可离线阅读，可加到手机主屏当 App 用
4. 想离线复习某章，先在线打开过一次让它进缓存
