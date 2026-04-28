import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';
const API_URL = 'http://localhost:8000';
const TIMESTAMP = Date.now();
const TEST_USER = {
  username: `e2e_${TIMESTAMP}`,
  password: 'TestPass123456',
};

// ── 辅助函数 ─────────────────────────────────────────────────

async function fillInput(page: Page, placeholder: string, value: string) {
  const input = page.locator(`input[placeholder="${placeholder}"]`);
  await input.click();
  await input.fill(value);
}

async function fillPassword(page: Page, placeholder: string, value: string) {
  const input = page.locator(`input[placeholder="${placeholder}"]`);
  await input.click();
  await input.fill(value);
}

/** 通过 API 注册用户，返回 user id */
async function registerViaApi(username: string, password: string): Promise<number> {
  const response = await fetch(`${API_URL}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await response.json();
  return data.data.id;
}

/** 通过 API 登录，返回 access_token */
async function loginViaApi(username: string, password: string): Promise<string> {
  const response = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await response.json();
  return data.data.access_token;
}

/** 通过数据库直接将用户角色升级为 admin */
async function promoteToAdmin(userId: number): Promise<void> {
  const { execSync } = await import('child_process');
  execSync(
    `cd ${process.cwd()}/backend && python3 -c "
import asyncio
from sqlalchemy import update
from app.database import async_session
from app.models.user import User

async def promote():
    async with async_session() as s:
        await s.execute(update(User).where(User.id == ${userId}).values(role='admin'))
        await s.commit()

asyncio.run(promote())
"`,
  );
}

/**
 * 点击 Ant Design 按钮 —— 由于 Ant Design 会给大号按钮文字加 letter-spacing，
 * 直接用 has-text 可能失配，统一用 getByRole + 正则来匹配。
 */
async function clickButton(page: Page, text: string) {
  // 生成一个宽松正则：允许字符间有可选空格，如 "新建角色" => /新\s*建\s*角\s*色/
  const fuzzyPattern = text.split('').join('\\s*');
  await page.getByRole('button', { name: new RegExp(fuzzyPattern) }).click();
}

/** 在指定容器内点击按钮 */
async function clickButtonIn(locator: ReturnType<Page['locator']>, text: string) {
  const fuzzyPattern = text.split('').join('\\s*');
  await locator.getByRole('button', { name: new RegExp(fuzzyPattern) }).click();
}

/** 登录并跳转到项目列表 */
async function loginAndGoToProjects(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  await fillInput(page, '用户名', TEST_USER.username);
  await fillPassword(page, '密码', TEST_USER.password);
  await clickButton(page, '登录');
  await page.waitForURL(/\/projects/, { timeout: 15000 });
  await page.waitForSelector('.ant-spin-spinning', { state: 'hidden', timeout: 10000 }).catch(() => {});
}

// ====================================================================
// 全局 setup：注册测试用户并升级为 admin
// ====================================================================

let testUserId: number;

test.beforeAll(async () => {
  testUserId = await registerViaApi(TEST_USER.username, TEST_USER.password);
  await promoteToAdmin(testUserId);
});

// ====================================================================
// Test Suite: CI.AI 端到端测试（中文 UI）
// ====================================================================

test.describe('CI.AI E2E Tests', () => {
  test.describe.configure({ mode: 'serial' });

  // ================================================================
  // Part 1: 基础页面与认证
  // ================================================================

  test('T1 - 首页重定向到登录页或项目页', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForURL(/\/(login|projects)/);
    expect(page.url()).toMatch(/\/(login|projects)/);
  });

  test('T2 - 登录页正确渲染', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await expect(page.locator('text=CI.AI')).toBeVisible();
    await expect(page.locator('text=AI 视频全流程自动化创作平台')).toBeVisible();
    await expect(page.locator('input[placeholder="用户名"]')).toBeVisible();
    await expect(page.locator('input[placeholder="密码"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /登\s*录/ })).toBeVisible();
  });

  test('T3 - 错误密码登录停留在登录页', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await fillInput(page, '用户名', TEST_USER.username);
    await fillPassword(page, '密码', 'wrongpassword');
    await clickButton(page, '登录');
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/login');
  });

  test('T4 - 登录成功跳转到项目列表', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await fillInput(page, '用户名', TEST_USER.username);
    await fillPassword(page, '密码', TEST_USER.password);
    await clickButton(page, '登录');
    await page.waitForURL(/\/projects/, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: '项目' })).toBeVisible({ timeout: 5000 });
  });

  test('T5 - 未认证用户无法访问项目页', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${BASE_URL}/projects`);
    await page.waitForURL(/\/login/, { timeout: 10000 });
  });

  test('T6 - 登录后侧边栏导航可见（中文）', async ({ page }) => {
    await loginAndGoToProjects(page);
    await expect(page.locator('.ant-menu .ant-menu-item').filter({ hasText: '项目' })).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.ant-menu .ant-menu-item').filter({ hasText: '资产库' })).toBeVisible();
    await expect(page.locator('.ant-menu .ant-menu-item').filter({ hasText: '设置' })).toBeVisible();
    // admin 用户应看到用户管理
    await expect(page.locator('.ant-menu .ant-menu-item').filter({ hasText: '用户管理' })).toBeVisible();
  });

  // ================================================================
  // Part 2: 资产库 - 创建角色、场景环境、风格
  // ================================================================

  test('T7 - 导航到资产库页面', async ({ page }) => {
    await loginAndGoToProjects(page);
    await page.click('.ant-menu .ant-menu-item:has-text("资产库")');
    await page.waitForURL(/\/assets/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: '资产库' })).toBeVisible({ timeout: 5000 });
  });

  test('T8 - 创建角色', async ({ page }) => {
    await loginAndGoToProjects(page);
    await page.click('.ant-menu .ant-menu-item:has-text("资产库")');
    await page.waitForURL(/\/assets/, { timeout: 10000 });

    // 默认在角色 Tab
    await clickButton(page, '新建角色');
    await expect(page.locator('.ant-modal')).toBeVisible({ timeout: 5000 });

    // 填写角色信息
    const modal = page.locator('.ant-modal');
    await modal.locator('input').first().fill(`测试角色_${TIMESTAMP}`);
    // 描述 textarea
    const textareas = modal.locator('textarea');
    if (await textareas.first().isVisible()) {
      await textareas.first().fill('这是一个测试角色的描述');
    }

    // 点击创建
    await clickButtonIn(modal, '创建');

    // 验证 Modal 关闭且角色出现在列表中
    await expect(page.locator('.ant-modal')).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator(`text=测试角色_${TIMESTAMP}`)).toBeVisible({ timeout: 5000 });
  });

  test('T9 - 创建场景环境', async ({ page }) => {
    await loginAndGoToProjects(page);
    await page.click('.ant-menu .ant-menu-item:has-text("资产库")');
    await page.waitForURL(/\/assets/, { timeout: 10000 });

    // 切换到场景环境 Tab
    await page.locator('.ant-tabs-tab').filter({ hasText: '场景环境' }).click();
    await page.waitForTimeout(500);

    await clickButton(page, '新建场景环境');
    await expect(page.locator('.ant-modal')).toBeVisible({ timeout: 5000 });

    const modal = page.locator('.ant-modal');
    await modal.locator('input').first().fill(`测试环境_${TIMESTAMP}`);
    const textareas = modal.locator('textarea');
    if (await textareas.first().isVisible()) {
      await textareas.first().fill('一个赛博朋克风格的城市街道');
    }

    await clickButtonIn(modal, '创建');
    await expect(page.locator('.ant-modal')).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator(`text=测试环境_${TIMESTAMP}`)).toBeVisible({ timeout: 5000 });
  });

  test('T10 - 创建风格', async ({ page }) => {
    await loginAndGoToProjects(page);
    await page.click('.ant-menu .ant-menu-item:has-text("资产库")');
    await page.waitForURL(/\/assets/, { timeout: 10000 });

    // 切换到风格 Tab
    await page.locator('.ant-tabs-tab').filter({ hasText: '风格' }).click();
    await page.waitForTimeout(500);

    await clickButton(page, '新建风格');
    await expect(page.locator('.ant-modal')).toBeVisible({ timeout: 5000 });

    const modal = page.locator('.ant-modal');
    // 风格名称
    await modal.locator('input').first().fill(`测试风格_${TIMESTAMP}`);
    // 提示词（必填）
    const textareas = modal.locator('textarea');
    await textareas.first().fill('赛博朋克，霓虹灯光，雨天城市，电影感');

    await clickButtonIn(modal, '创建');
    await expect(page.locator('.ant-modal')).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator(`text=测试风格_${TIMESTAMP}`)).toBeVisible({ timeout: 5000 });
  });

  // ================================================================
  // Part 3: 用户管理（Admin）
  // ================================================================

  test('T11 - 导航到用户管理页面', async ({ page }) => {
    await loginAndGoToProjects(page);
    await page.click('.ant-menu .ant-menu-item:has-text("用户管理")');
    await page.waitForURL(/\/admin\/users/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: '用户管理' })).toBeVisible({ timeout: 5000 });
  });

  test('T12 - 用户管理页显示用户列表', async ({ page }) => {
    await loginAndGoToProjects(page);
    await page.click('.ant-menu .ant-menu-item:has-text("用户管理")');
    await page.waitForURL(/\/admin\/users/, { timeout: 10000 });

    // 等待表格加载
    await page.waitForSelector('.ant-table-tbody', { timeout: 10000 });

    // 应能看到当前测试用户
    await expect(page.locator('.ant-table-tbody').locator(`text=${TEST_USER.username}`)).toBeVisible({ timeout: 5000 });
  });

  test('T13 - 管理积分功能', async ({ page }) => {
    await loginAndGoToProjects(page);
    await page.click('.ant-menu .ant-menu-item:has-text("用户管理")');
    await page.waitForURL(/\/admin\/users/, { timeout: 10000 });
    await page.waitForSelector('.ant-table-tbody', { timeout: 10000 });

    // 找到当前测试用户那一行的"管理积分"按钮
    const userRow = page.locator('.ant-table-tbody tr').filter({ hasText: TEST_USER.username });
    await clickButtonIn(userRow, '管理积分');

    // Modal 弹出
    await expect(page.locator('.ant-modal')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.ant-modal').locator('text=当前余额')).toBeVisible();

    // 输入充值数额
    const amountInput = page.locator('.ant-modal .ant-input-number input');
    await amountInput.fill('100');

    // 输入原因
    const reasonInput = page.locator('.ant-modal input[placeholder*="手动充值"]');
    if (await reasonInput.isVisible()) {
      await reasonInput.fill('E2E 测试充值');
    }

    // 点击更新
    await clickButtonIn(page.locator('.ant-modal'), '更新');

    // Modal 关闭
    await expect(page.locator('.ant-modal')).not.toBeVisible({ timeout: 5000 });
  });

  // ================================================================
  // Part 4: 新建项目并走完整流程
  // ================================================================

  test('T14 - 新用户项目列表为空', async ({ page }) => {
    await loginAndGoToProjects(page);
    const hasEmpty = await page.locator('text=暂无项目').isVisible({ timeout: 5000 }).catch(() => false);
    const hasZero = await page.getByText('0 个项目').isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasEmpty || hasZero).toBeTruthy();
  });

  test('T15 - 创建新项目', async ({ page }) => {
    await loginAndGoToProjects(page);

    // 点击新建项目
    await clickButton(page, '新建项目');
    await expect(page.locator('.ant-modal')).toBeVisible({ timeout: 5000 });

    // 填写项目名称
    const modal = page.locator('.ant-modal');
    await modal.locator('input[placeholder*="赛博朋克"]').fill(`E2E测试项目_${TIMESTAMP}`);

    // 选择风格（如果有刚创建的风格）
    const styleSelect = modal.locator('.ant-select');
    if (await styleSelect.isVisible()) {
      await styleSelect.click();
      const styleOption = page.locator('.ant-select-dropdown .ant-select-item').filter({ hasText: `测试风格_${TIMESTAMP}` });
      if (await styleOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await styleOption.click();
      } else {
        // 关闭下拉框
        await page.keyboard.press('Escape');
      }
    }

    // 点击创建
    await clickButtonIn(modal, '创建');
    await expect(page.locator('.ant-modal')).not.toBeVisible({ timeout: 5000 });

    // 新项目出现在列表中
    await expect(page.locator(`text=E2E测试项目_${TIMESTAMP}`)).toBeVisible({ timeout: 5000 });
  });

  test('T16 - 点击项目卡片进入项目详情', async ({ page }) => {
    await loginAndGoToProjects(page);

    // 点击项目卡片
    await page.locator('.ant-card').filter({ hasText: `E2E测试项目_${TIMESTAMP}` }).click();

    // 等待跳转到项目详情页
    await page.waitForURL(/\/projects\/\d+/, { timeout: 10000 });

    // 验证项目名称出现
    await expect(page.locator(`text=E2E测试项目_${TIMESTAMP}`)).toBeVisible({ timeout: 5000 });
  });

  test('T17 - 项目详情页有工具栏按钮', async ({ page }) => {
    await loginAndGoToProjects(page);
    await page.locator('.ant-card').filter({ hasText: `E2E测试项目_${TIMESTAMP}` }).click();
    await page.waitForURL(/\/projects\/\d+/, { timeout: 10000 });

    // 等待页面完全加载
    await page.waitForTimeout(2000);

    // 检查底部工具栏的按钮（用宽松正则匹配）
    await expect(page.getByRole('button', { name: /全部生成图片/ })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /全部生成视频/ })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /导出/ })).toBeVisible({ timeout: 5000 });
  });

  // ================================================================
  // Part 5: 设置页面
  // ================================================================

  test('T18 - 设置页面显示 API 配置', async ({ page }) => {
    await loginAndGoToProjects(page);
    await page.click('.ant-menu .ant-menu-item:has-text("设置")');
    await page.waitForURL(/\/settings/, { timeout: 10000 });

    await expect(page.getByRole('heading', { name: '系统设置' })).toBeVisible({ timeout: 5000 });

    // 检查 4 个 API 配置卡片
    await expect(page.locator('text=文本生成 API')).toBeVisible();
    await expect(page.locator('text=图片生成 API')).toBeVisible();
    await expect(page.locator('text=视频生成 API')).toBeVisible();
    await expect(page.locator('text=音频生成 API')).toBeVisible();

    // admin 用户应看到保存按钮
    await expect(page.getByRole('button', { name: /全部保存/ })).toBeVisible();
  });

  // ================================================================
  // Part 6: 语言切换
  // ================================================================

  test('T19 - 中英文切换功能', async ({ page }) => {
    await loginAndGoToProjects(page);

    // 默认中文，侧边栏显示"项目"
    await expect(page.locator('.ant-menu .ant-menu-item').filter({ hasText: '项目' })).toBeVisible();

    // 点击语言切换按钮（顶部栏的 EN 按钮）
    await clickButton(page, 'EN');
    await page.waitForTimeout(1000);

    // 切换后应显示英文
    await expect(page.locator('.ant-menu .ant-menu-item').filter({ hasText: 'Projects' })).toBeVisible({ timeout: 5000 });

    // 再切回中文
    await clickButton(page, '中文');
    await page.waitForTimeout(1000);

    await expect(page.locator('.ant-menu .ant-menu-item').filter({ hasText: '项目' })).toBeVisible({ timeout: 5000 });
  });

  // ================================================================
  // Part 7: API 健康检查
  // ================================================================

  test('T20 - 后端 API 健康检查', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/api/v1/auth/me`);
    expect(response.status()).not.toBe(500);
  });
});
