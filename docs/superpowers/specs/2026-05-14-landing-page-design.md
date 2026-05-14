# Landing Page 设计文档

- **日期**：2026-05-14
- **作者**：Claude（与勿听协作 brainstorming）
- **状态**：待审核

## 背景与目标

CI.AI 当前访问 `http://47.110.152.27/` 会直接跳转到登录页。对潜在用户、投资人、合作伙伴而言这缺乏第一印象与产品信息。

本设计为 CI.AI 增加一个公开的落地页，承担：

1. 向访客介绍产品定位、能力与流程
2. 提供登录入口（已有用户）与申请试用入口（潜在用户）
3. 收集试用申请到数据库，admin 在后台可查看与处理

## 决策摘要

| 决策点 | 选择 |
|---|---|
| 受众 | 潜在用户 + 投资人展示页 |
| 内容范围 | 标准版：Hero + 核心能力 4 项 + 制作流程 4 步 + 截图卡片墙 + CTA |
| 行动入口 | 双 CTA：登录 + 申请试用 |
| 申请试用数据去向 | 存数据库（新建 `trial_requests` 表 + 后端接口 + admin 后台查看） |
| 示例素材 | 静态截图卡片墙（6 张占位，后续替换） |
| 视觉风格 | 电影感深色：大字 / 留白 / 柔和紫色光晕 / 缓慢淡入 |
| 多语言 | 中英双语，沿用现有 `localeStore` |
| 路由行为 | 方案 A：`/` 永远展示落地页，已登录访客顶部 CTA 自动切换为「进入工作台」 |

---

## 架构与路由

### 路由调整（`src/App.tsx`）

```text
/              → LandingPage  （新增，公开）
/login         → LoginPage    （不变）
/projects 等   → ProtectedRoute（不变）
/admin/trial-requests → 新增（requireAdmin）
*              → /            （兜底从 /projects 改为 /）
```

### 顶部导航行为

- 未登录：Logo · 语言切换器 · `[登录]` · `[申请试用]`（主按钮）
- 已登录：Logo · 语言切换器 · 头像下拉 · `[进入工作台]`（主按钮，跳 `/projects`）

### 文件落点（前端）

```text
src/pages/Landing/
  index.tsx              # 主容器（控制滚动锚点 / Modal 状态）
  Header.tsx             # 顶部导航（智能 CTA）
  Hero.tsx               # 主视觉区
  Features.tsx           # 核心能力 4 项
  Workflow.tsx           # 制作流程 4 步
  Showcase.tsx           # 静态截图卡片墙
  CtaSection.tsx         # 底部行动召唤
  Footer.tsx             # 简洁 footer
  TrialRequestModal.tsx  # 申请试用表单
  styles.module.css      # 共享样式（光晕、动画 keyframes）

src/api/trialRequests.ts          # 申请试用 API 客户端

src/pages/Admin/TrialRequests.tsx # admin 后台列表页
src/components/Layout/AppLayout.tsx  # 改：admin 侧边栏新增「试用申请」菜单项（icon: MailOutlined）
```

> admin 入口位置：在 `AppLayout.tsx` 现有 admin 侧边栏菜单（`用户管理` 同级）下方新增 `试用申请` 条目，路由 `/admin/trial-requests`。**不**采用「合并到用户管理页 Tab」方案，因为试用申请与用户管理是两个独立资源，独立菜单语义更清晰。

`src/locales/{zh,en}.ts`：新增 `landing.*` 命名空间（含 hero / features / workflow / showcase / cta / footer / trialModal）。

---

## 视觉系统

| 项 | 规格 |
|---|---|
| 主背景 | `#0c0c0c` 黑底 |
| 装饰光斑 | 2-3 处 `radial-gradient`，颜色 `#a855f7`，不透明度 0.15-0.25，`blur(200px)`，`position: fixed`，缓慢循环位移（30s）|
| 字体 | Inter / 系统字体；标题 `clamp(48px, 6vw, 96px)`，字距 `-0.02em` |
| 节奏 | 每个区块 `padding: 120px 80px`，最大宽 1200px 居中 |
| 主色 | `#a855f7`（hover `#c084fc`） |
| 卡片 | 底色 `#141414`，描边 `#1f1f1f`，圆角 16，hover 上抬 4px + 描边渐紫 |
| 按钮 | 主按钮紫底；hover scale 1.02 + `box-shadow: 0 0 32px rgba(168,85,247,0.4)` |

---

## 区块内容

### Hero

- 主标题（zh）：「让一段文字 / 长成一部影像」（两行）
- 主标题（en）：`From script to screen, automated.`（单行或两行）
- 副标题（zh）：`资产驱动 · 角色一致 · 一键成片`
- 副标题（en）：`Asset-driven · Character-consistent · One-click delivery`
- 主 CTA：`立即登录` / `Sign In` → `/login`
- 次 CTA：`申请试用 →` / `Request Access →` → 打开 `TrialRequestModal`

### Features（4 项卡片，2×2 网格）

| zh 标题 | zh 描述 | en 标题 | en 描述 |
|---|---|---|---|
| 资产驱动一致性 | 角色 / 环境 / 风格定义一次，全片复用，AI 视觉永不跳脱 | Asset-driven consistency | Define characters, environments, styles once. Reuse across every shot. |
| AI 剧本智能拆分 | 一段文案，自动拆成镜头脚本与场景结构 | AI script breakdown | Turn text into a structured shot list — automatically. |
| 多模型矩阵 | 图像 / 视频 / 语音模型自由切换，按需选最合适的 | Multi-model matrix | Mix providers per shot — pick what fits. |
| 一键批量成片 | 图 → 视频 → 音频 → ZIP 打包，全程异步 | One-click batch generation | Image → video → audio → ZIP. End-to-end async. |

### Workflow（4 步横向时间轴）

`定义资产 → 剧本拆分 → 批量生成 → 导出成片`

`Define assets → Break down → Batch generate → Export`

每步配图标 + 一行说明，相邻步骤之间画淡紫色连线。

### Showcase（截图卡片墙，3×2）

| zh 标题 | en 标题 |
|---|---|
| 角色库 | Character library |
| 剧本拆分 | Script breakdown |
| 镜头编辑器 | Shot editor |
| 批量生成进度 | Batch generation |
| 资产详情 | Asset detail |
| 项目导出 | Export |

每卡：图片 + 标题，hover 时图片 `scale(1.03)`。图片先用渐变占位 + TODO 注释，后续替换为真实截图（用户提供）。

### CTA Section

- 居中大标题：「准备好让 AI 帮你创作下一部影像？」/ `Ready to make your next film with AI?`
- 双 CTA 按钮（同 Hero）

### Footer

- 左：Logo + `© 2026 CI.AI · AI 视频创作平台`
- 右：联系邮箱（用户提供） · ICP 备案占位 · 当前版本号（读自 `package.json` 的 `version` 字段，通过 Vite 的 `import.meta.env` 或 `define` 注入）

---

## 动效

基于已装的 `motion` 库。

| 场景 | 实现 |
|---|---|
| 区块进入视口 | `motion.section` + `initial={{opacity:0, y:24}}` + `whileInView={{opacity:1, y:0}}` + `viewport={{once:true, amount:0.2}}` + `duration:0.6 ease:"easeOut"` |
| 卡片 stagger | 子元素之间 80ms 间隔 |
| Hero 标题 | 入场后再延迟 200ms 单独 fade-in |
| 背景光斑 | CSS `@keyframes` 30s 慢速位移 + 透明度脉冲，纯 CSS（不进 JS 动画线程） |
| 按钮 hover | `transform: scale(1.02)` + 紫色辉光 |
| 截图卡 hover | `transform: scale(1.03)` + 描边渐紫 |
| 减少动效偏好 | `@media (prefers-reduced-motion: reduce)` 时全部跳过 transform / opacity 动画 |

---

## 后端「申请试用」

### 数据模型 `backend/app/models/trial_request.py`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | int PK | 自增 |
| `email` | str(255) | 必填 |
| `name` | str(64) | 必填，联系人姓名 |
| `company` | str(128) nullable | 选填 |
| `use_case` | text nullable | 选填，最长 500 字（前端限制） |
| `ip` | str(64) nullable | 提交方 IP |
| `user_agent` | str(512) nullable | 选填 |
| `status` | str(16) | enum: `pending` / `contacted` / `approved` / `rejected`，默认 `pending` |
| `admin_notes` | text nullable | admin 私有备注 |
| `created_at` | datetime | server_default `now()` |
| `updated_at` | datetime | server_default `now()`, onupdate `now()` |

### API 端点

| Method | Path | 鉴权 | 用途 |
|---|---|---|---|
| POST | `/api/v1/trial-requests` | 公开 | 落地页表单提交 |
| GET  | `/api/v1/admin/trial-requests` | admin | 分页列表（status 筛选 + 关键字搜索） |
| PUT  | `/api/v1/admin/trial-requests/{id}` | admin | 更新 `status` / `admin_notes` |
| DELETE | `/api/v1/admin/trial-requests/{id}` | admin | 删除 |

### 防刷策略（不引新依赖）

- **同邮箱 24h 内 1 次**：service 层先 `SELECT WHERE email=? AND created_at > now()-24h`，命中返回 429
- **同 IP 24h 内 ≤ 5 次**：同上对 `ip` 字段
- **蜜罐字段**：表单含隐藏 input `website`，bot 会填，后端检测到非空就静默 `return ApiResponse()` 不入库不报错
- 不引 captcha / slowapi / Redis 限流（YAGNI），后续真有滥用再加

### 后端文件落点

```text
backend/app/
  models/trial_request.py            # 新增 ORM
  models/__init__.py                 # 改：导入新模型让 auto-migrate 看到
  schemas/trial_request.py           # 新增 Pydantic：CreateRequest / Out / UpdateRequest
  services/trial_request_service.py  # 新增：create / list / update / delete + 防刷
  routers/trial_requests.py          # 新增：公开 POST 路由
  routers/admin.py                   # 改：追加 GET / PUT / DELETE /admin/trial-requests
  main.py                            # 改：include_router(trial_requests.router)
  alembic/versions/xxx_add_trial_requests.py  # 新增 alembic 迁移
```

> auto-migrate 会兜底建表（本地 dev），生产仍走 alembic。

---

## 错误处理

### 前端「申请试用」表单

| 后端响应 | 用户体验 |
|---|---|
| 200 | 绿色 toast「已收到，24 小时内联系您」+ 关闭弹窗 |
| 429 | 黄色 toast「该邮箱 24 小时内已申请过，请稍后」 |
| 422 | 表单内字段红字提示（Antd Form 自带） |
| 500 / 网络异常 | 红色 toast「提交失败，请稍后重试」+ 弹窗保持打开，留住输入 |

### 前端 admin 列表

沿用 `client.ts` 全局错误处理（401 跳登录，其他 toast）。

### 后端

- service 层抛 `HTTPException(429/409/...)`，`main.py` 全局 handler 包装为 `ApiResponse{code,message}`
- 蜜罐命中：直接 `return ApiResponse()` 不入库不报错
- 服务器异常落入全局 handler

---

## 国际化

新增 `landing` 命名空间，结构示例：

```ts
landing: {
  header: { signIn, requestTrial, enterApp },
  hero: { title, subtitle, ctaPrimary, ctaSecondary },
  features: { sectionTitle, items: [{title, desc}, ...] },
  workflow: { sectionTitle, steps: [{title, desc}, ...] },
  showcase: { sectionTitle, items: [{title}, ...] },
  cta: { title, ctaPrimary, ctaSecondary },
  footer: { copyright, contact, version },
  trialModal: {
    title, name, email, company, useCase,
    submit, cancel,
    successMsg, duplicateMsg, errorMsg,
    placeholders: { name, email, company, useCase },
  },
}
```

中英两份内容均按本文「区块内容」节落实。

---

## 待用户提供的资产

| 项 | 说明 |
|---|---|
| 6 张产品截图 | 替换 Showcase 占位（角色库 / 剧本拆分 / 镜头编辑器 / 批量生成 / 资产详情 / 项目导出） |
| 联系邮箱 | Footer 与申请试用 toast 文案中使用 |
| ICP 备案号（如有） | Footer 占位替换 |

实现时先用占位 + TODO 注释，提交 PR 后由用户替换。

---

## 验收标准

- [ ] 未登录访客访问 `http://47.110.152.27/` 看到落地页（不再跳登录）
- [ ] 已登录访客访问 `/` 也看到落地页，顶部按钮变为「进入工作台」
- [ ] 中英文切换正常，所有可见文案均走 i18n
- [ ] Hero / Features / Workflow / Showcase / CTA / Footer 6 个区块均按设计实现，淡入动效正常
- [ ] 「申请试用」Modal 表单可提交，成功后 toast 提示，重复提交返回 429 并提示
- [ ] 蜜罐字段被填写时静默成功（不入库）
- [ ] admin 在 `/admin/trial-requests` 看到列表，可改状态、加备注、删除
- [ ] alembic 迁移生成；本地 auto-migrate 启动日志中能看到表创建
- [ ] `prefers-reduced-motion: reduce` 下不触发 transform/opacity 动画
- [ ] `npm run build` 与 `npm run lint` 通过
- [ ] backend `python -m py_compile` 通过
- [ ] 手动用浏览器走完一遍登录态 / 未登录态 / 中英切换 / 申请试用 / admin 查看 五条路径

---

## 不在范围（YAGNI）

- captcha（hCaptcha / reCaptcha）
- slowapi 速率限制器
- Redis-based 防刷
- 试用申请通过后自动给申请者发邮件
- admin 一键将申请者转为正式用户（admin 仍走现有创建用户接口）
- A/B 测试 / 流量统计埋点
- SSR / SEO 优化（当前是 SPA，搜索引擎可见性不在本次范围）
