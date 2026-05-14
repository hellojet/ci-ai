# Landing Page 实施计划

- **日期**：2026-05-14
- **关联 Spec**：`docs/superpowers/specs/2026-05-14-landing-page-design.md`
- **状态**：待用户批准开工

## 实施顺序

按 **后端 → 前端基础（路由+空壳）→ 前端区块（独立可测试）→ admin 页 → 验收 → 部署** 顺序，每一步独立可验证、独立可回滚。每一步完成后做 typecheck / py_compile / build 静态校验，最后一步统一手测 + 部署。

---

## 阶段 1：后端 trial_requests（约 1.5 小时）

> 这一阶段完成后，可用 `curl POST /api/v1/trial-requests` 走通整条链路，与前端解耦。

**Step 1.1** —— 数据模型
- 新增 `backend/app/models/trial_request.py`，按 spec 字段定义 ORM
- 改 `backend/app/models/__init__.py`，导入 `TrialRequest` 让 auto-migrate 看到

**Step 1.2** —— Pydantic schemas
- 新增 `backend/app/schemas/trial_request.py`，含：
  - `TrialRequestCreate`（公开提交，含蜜罐 `website` 字段，`EmailStr` 校验邮箱）
  - `TrialRequestOut`（admin 列表使用，全字段）
  - `TrialRequestUpdate`（admin 更新，仅 `status` + `admin_notes`，可选）

**Step 1.3** —— Service 层
- 新增 `backend/app/services/trial_request_service.py`，导出：
  - `create(db, payload, ip, user_agent) -> TrialRequest`
    - 蜜罐检查：`payload.website` 非空 → 直接 `return None`（路由层据此返回静默 200）
    - 同邮箱 24h 检查 → 命中抛 `HTTPException(429, "Email already submitted within 24 hours")`
    - 同 IP 24h ≤5 检查 → 命中抛 `HTTPException(429, "Too many requests from this IP")`
    - 入库
  - `list(db, page, page_size, status_filter, keyword) -> tuple[list, int]`
  - `update(db, id, payload) -> TrialRequest`
  - `delete(db, id) -> None`

**Step 1.4** —— 公开路由
- 新增 `backend/app/routers/trial_requests.py`：
  - `POST /api/v1/trial-requests`（无鉴权依赖）
  - 从 `Request` 取 `client.host` + `user-agent` 头传入 service
  - 蜜罐命中时返回 `ApiResponse(message="ok")` 不入库不报错
- 改 `backend/app/main.py`：`app.include_router(trial_requests.router, prefix="/api/v1")`

**Step 1.5** —— Admin 路由
- 改 `backend/app/routers/admin.py`，追加：
  - `GET /admin/trial-requests`（分页 + status 筛选 + keyword 搜索 email/name/company）
  - `PUT /admin/trial-requests/{id}`
  - `DELETE /admin/trial-requests/{id}`

**Step 1.6** —— Alembic 迁移
- 在 backend 目录运行 `alembic revision --autogenerate -m "add trial_requests"`
- 检查生成的迁移文件，确保字段、索引、默认值都对（重点：email 索引、created_at 索引便于 24h 查询）
- 不立即执行 `alembic upgrade head`，保留迁移文件即可，本地由 auto-migrate 兜底

**Step 1.7** —— 静态校验
- `cd backend && python -m py_compile app/models/trial_request.py app/schemas/trial_request.py app/services/trial_request_service.py app/routers/trial_requests.py app/routers/admin.py app/main.py`
- 启动后端 + curl 烟测：
  - `curl -X POST localhost:8000/api/v1/trial-requests -d '{"name":"a","email":"a@b.com"}'` → 200
  - 重复 → 429
  - `curl -X POST .../trial-requests -d '{"name":"a","email":"a@b.com","website":"x"}'` → 200（但 DB 不应有新行，蜜罐生效）

---

## 阶段 2：前端路由调整 + 落地页空壳（约 30 分钟）

> 这一阶段完成后，访客访问 `/` 看到一个空白但路由通的落地页（仅 Header + 占位文案），登录态判断正常。

**Step 2.1** —— 路由
- 改 `src/App.tsx`：
  - `import LandingPage from '@/pages/Landing'`
  - `<Route path="/" element={<LandingPage />} />`
  - 兜底 `*` 改为 `<Navigate to="/" replace />`

**Step 2.2** —— 落地页主容器（空壳）
- 新增 `src/pages/Landing/index.tsx`：基础 Layout + `<Header />` + 空 `<main>` + `<Footer />`
- 新增 `src/pages/Landing/Header.tsx`：Logo · 语言切换器 · 智能 CTA（已登录看到「进入工作台」，未登录看到「登录 / 申请试用」）
- 新增 `src/pages/Landing/Footer.tsx`：版权 + 联系（占位）+ 版本（从 `package.json` 注入）
- 新增 `src/pages/Landing/styles.module.css`：全局背景光斑 keyframes + reduced-motion 兜底

**Step 2.3** —— 版本号注入
- 改 `vite.config.ts`：用 `define` 注入 `__APP_VERSION__` = `package.json` 的 version

**Step 2.4** —— 静态校验
- `npx tsc --noEmit`
- 浏览器看 `/`：能加载，未登录 Header 显示「登录 / 申请试用」按钮，已登录显示头像 + 「进入工作台」

---

## 阶段 3：前端区块逐个实现（约 3 小时）

> 每个区块独立组件，独立 motion 动画，独立 i18n。每完成一个，能直接在页面看到效果，可单独验收。

**Step 3.1** —— i18n 文案
- 改 `src/locales/zh.ts` 和 `en.ts`：新增完整 `landing.*` 命名空间（含 hero / features / workflow / showcase / cta / footer / trialModal 全部子键）

**Step 3.2** —— Hero
- 新增 `src/pages/Landing/Hero.tsx`：大字标题 + 副标题 + 双 CTA + 入场动画 + 背景光斑
- 在 `index.tsx` 里挂上

**Step 3.3** —— Features
- 新增 `src/pages/Landing/Features.tsx`：2×2 网格，4 个能力卡片，stagger 动画

**Step 3.4** —— Workflow
- 新增 `src/pages/Landing/Workflow.tsx`：横向 4 步，相邻间淡紫色连线（CSS `::before`）

**Step 3.5** —— Showcase
- 新增 `src/pages/Landing/Showcase.tsx`：3×2 卡片墙，6 张占位（渐变方块 + TODO 注释 `{/* TODO: 替换为真实截图 */}`）

**Step 3.6** —— CTA Section
- 新增 `src/pages/Landing/CtaSection.tsx`：居中大标题 + 双 CTA

**Step 3.7** —— 静态校验
- `npx tsc --noEmit` 通过
- `npm run lint` 通过
- 浏览器走查每个区块：动画顺畅、文案对、中英切换正常、reduced-motion 启用时无动画

---

## 阶段 4：申请试用 Modal + 前端 API（约 1 小时）

**Step 4.1** —— API 客户端
- 新增 `src/api/trialRequests.ts`：
  ```ts
  export interface TrialRequestPayload { name; email; company?; useCase?; website?; }
  export interface TrialRequestRecord { id; name; email; ... status; ... }
  export const trialRequestsApi = {
    submit: (payload) => apiClient.post('/api/v1/trial-requests', payload),
    list: (params) => apiClient.get('/api/v1/admin/trial-requests', {params}),
    update: (id, payload) => apiClient.put(`/api/v1/admin/trial-requests/${id}`, payload),
    delete: (id) => apiClient.delete(`/api/v1/admin/trial-requests/${id}`),
  }
  ```

**Step 4.2** —— TrialRequestModal
- 新增 `src/pages/Landing/TrialRequestModal.tsx`：
  - Antd `Modal` + `Form`：name (required) / email (required, type=email) / company (optional) / useCase (Textarea, max 500)
  - 隐藏蜜罐 `website` 字段（visually hidden 但保留在 DOM）
  - 提交按钮 loading 态
  - 错误处理：429 黄色 toast / 422 字段红字 / 500 红色 toast，弹窗保持打开
  - 成功：绿色 toast + 关闭弹窗 + reset form
- 在 `index.tsx` 用 `useState` 控制 open/close，Header 与 Hero 与 CTA Section 的 `申请试用` 按钮都触发

**Step 4.3** —— 静态校验
- `npx tsc --noEmit` 通过
- 浏览器走查：填表 → 成功 toast；重复填同邮箱 → 429 toast；空字段 → 红字校验

---

## 阶段 5：admin 试用申请管理页（约 1.5 小时）

**Step 5.1** —— 路由 + 侧边栏
- 改 `src/App.tsx`：新增 `<Route path="/admin/trial-requests" element={<ProtectedRoute requireAdmin><TrialRequestsPage /></ProtectedRoute>} />`
- 改 `src/components/Layout/AppLayout.tsx`：admin 侧边栏在「用户管理」之后追加「试用申请」（icon `MailOutlined`，key `trialRequests`），routeMap 加映射
- 改 `src/locales/{zh,en}.ts`：`layout.trialRequests` = `试用申请` / `Trial Requests`

**Step 5.2** —— 列表页
- 新增 `src/pages/Admin/TrialRequests.tsx`：
  - Antd `Table` + 分页 + status 筛选 + 关键字搜索框
  - 列：ID / 姓名 / 邮箱 / 公司 / 状态（带颜色 Tag） / 提交时间 / 操作（查看详情 Drawer / 删除按钮带确认）
  - 详情 Drawer：完整信息 + status 切换 Select + admin_notes Textarea + 保存按钮
  - 调用 `trialRequestsApi.list / update / delete`

**Step 5.3** —— 静态校验
- `npx tsc --noEmit` 通过
- 浏览器走查：admin 登录 → 侧边栏看到「试用申请」→ 点进去看到列表（含前面阶段提交的测试数据）→ 改状态/备注/删除均生效

---

## 阶段 6：验收 + 部署（约 30 分钟）

**Step 6.1** —— 走完 spec 验收 checklist 全部 11 项

**Step 6.2** —— 构建
- `npm run build`（确保 production 构建无错）
- `npm run lint`

**Step 6.3** —— 提交
- 按阶段拆分 commit（建议 5-6 个 commit），最后一个统一 push
- commit message 中文，遵循现有项目风格（feat / fix / docs 前缀）

**Step 6.4** —— 部署
- 调用 `./scripts/deploy-remote.sh` 部署到 `47.110.152.27`
- 失败时按 CLAUDE.md 的「不要破坏性重试」原则停下报错

---

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| auto-migrate 对 `text` / 索引兼容性 | 阶段 1 完成后启动 backend 看 `Auto-migrate` 日志确认 |
| `motion` 库与 React 19 兼容性 | 项目已在用 motion，按现有用法即可，不引新 API |
| Vite `define` 注入 `__APP_VERSION__` 和 TS 报错 | 在 `src/vite-env.d.ts` 声明全局类型 `declare const __APP_VERSION__: string` |
| 占位截图丑 | 用 CSS 渐变 + 区块标题文字，确保不放真实截图也能演示给人看 |
| 同 IP 防刷误伤（NAT 多用户共享出口） | 24h 限 5 次足够宽松，真出问题再调阈值 |

---

## 不在本计划范围

- 真实截图替换（用户后续提供）
- 联系邮箱与 ICP 备案号填充（用户提供）
- Hero 装饰视频（先纯背景光斑）
- 申请通过后自动给申请者发邮件
- 前端 SEO / SSR

---

## 总耗时估算

约 **8 小时**（不含用户提供资产后的二次替换）
