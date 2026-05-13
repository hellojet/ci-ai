import { useState, useEffect, useCallback } from 'react';
import { Layout, Menu, Avatar, Dropdown, Button, Tooltip, Drawer } from 'antd';
import {
  FolderOpenOutlined,
  UserOutlined,
  SettingOutlined,
  TeamOutlined,
  AppstoreOutlined,
  LogoutOutlined,
  TranslationOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MenuOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router';
import { useAuthStore } from '@/stores/authStore';
import { useLocale } from '@/hooks/useLocale';
import CreditsDisplay from '@/components/CreditsDisplay';
import { LogoIcon } from '@/components/Icons';
import type { MenuProps } from 'antd';

const { Sider, Header, Content } = Layout;

/** 窗口宽度低于此值时，侧边栏改为 Drawer 覆盖模式 */
const MOBILE_BREAKPOINT = 768;

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { t, lang, toggleLang } = useLocale();

  // 宽屏下的折叠状态（图标模式）
  const [collapsed, setCollapsed] = useState(false);
  // 窄屏下 Drawer 是否打开
  const [drawerOpen, setDrawerOpen] = useState(false);
  // 是否为移动端窄屏
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BREAKPOINT);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      if (!mobile) setDrawerOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getSelectedKey = () => {
    const path = location.pathname;
    if (path.startsWith('/projects')) return 'projects';
    if (path.startsWith('/assets')) return 'assets';
    if (path.startsWith('/settings')) return 'settings';
    if (path.startsWith('/admin')) return 'admin';
    return 'projects';
  };

  const sideMenuItems: MenuProps['items'] = [
    {
      key: 'projects',
      icon: <FolderOpenOutlined />,
      label: t('layout.projects'),
    },
    {
      key: 'assets',
      icon: <AppstoreOutlined />,
      label: t('layout.assetLibrary'),
    },
    ...(user?.role === 'admin'
      ? [
          {
            key: 'settings',
            icon: <SettingOutlined />,
            label: t('layout.settings'),
          },
        ]
      : []),
    ...(user?.role === 'admin'
      ? [
          {
            key: 'admin',
            icon: <TeamOutlined />,
            label: t('layout.userManagement'),
          },
        ]
      : []),
  ];

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: user?.username || 'User',
      disabled: true,
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: t('layout.logout'),
      danger: true,
    },
  ];

  const handleMenuClick: MenuProps['onClick'] = useCallback(({ key }: { key: string }) => {
    const routeMap: Record<string, string> = {
      projects: '/projects',
      assets: '/assets',
      settings: '/settings',
      admin: '/admin/users',
    };
    if (routeMap[key]) {
      navigate(routeMap[key]);
      // 移动端点击菜单后自动关闭 Drawer
      setDrawerOpen(false);
    }
  }, [navigate]);

  const handleUserMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'logout') {
      logout();
      navigate('/login');
    }
  };

  /** 侧边栏 Logo + 标题 */
  const siderHeader = (showTitle: boolean) => (
    <div
      style={{
        height: 56,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: showTitle ? '0 20px' : '0 16px',
        justifyContent: showTitle ? 'flex-start' : 'center',
        borderBottom: '1px solid #1e1e1e',
        flexShrink: 0,
      }}
    >
      <LogoIcon />
      {showTitle && (
        <span style={{ color: '#fff', fontSize: 16, fontWeight: 700, letterSpacing: 1, whiteSpace: 'nowrap' }}>
          CI.AI
        </span>
      )}
    </div>
  );

  /** 侧边栏菜单 */
  const siderMenu = (
    <Menu
      mode="inline"
      selectedKeys={[getSelectedKey()]}
      onClick={handleMenuClick}
      items={sideMenuItems}
      style={{
        background: 'transparent',
        borderRight: 'none',
        color: '#999',
        marginTop: 8,
      }}
      theme="dark"
      inlineCollapsed={!isMobile && collapsed}
    />
  );

  /** 宽屏底部折叠/展开按钮 */
  const collapseToggle = (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: collapsed ? 'center' : 'flex-end',
        padding: collapsed ? 0 : '0 12px',
      }}
    >
      <Button
        type="text"
        icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        onClick={() => setCollapsed(!collapsed)}
        style={{ color: '#666', fontSize: 16 }}
      />
    </div>
  );

  return (
    <Layout style={{ height: '100vh', background: '#0c0c0c' }}>
      {/* ---- 宽屏：正常 Sider（可折叠为图标模式） ---- */}
      {!isMobile && (
        <Sider
          width={200}
          collapsedWidth={60}
          collapsed={collapsed}
          trigger={null}
          style={{
            background: '#0c0c0c',
            borderRight: '1px solid #1e1e1e',
            position: 'relative',
            transition: 'all 0.2s ease',
          }}
        >
          {siderHeader(!collapsed)}
          {siderMenu}
          {collapseToggle}
        </Sider>
      )}

      {/* ---- 窄屏：Drawer 覆盖式侧边栏 ---- */}
      <Drawer
        placement="left"
        open={isMobile && drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={240}
        closable={false}
        styles={{
          body: { padding: 0, background: '#0c0c0c', display: 'flex', flexDirection: 'column' },
          wrapper: {},
        }}
        rootStyle={{ position: 'absolute' }}
      >
        {siderHeader(true)}
        {siderMenu}
      </Drawer>

      <Layout>
        <Header
          style={{
            height: 56,
            background: '#0c0c0c',
            borderBottom: '1px solid #1e1e1e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: '0 24px',
            gap: 16,
          }}
        >
          {/* 窄屏：左侧汉堡按钮 */}
          {isMobile && (
            <Button
              type="text"
              icon={<MenuOutlined />}
              onClick={() => setDrawerOpen(true)}
              style={{ color: '#999', fontSize: 18, marginRight: 'auto' }}
            />
          )}
          <CreditsDisplay />
          <Tooltip title={lang === 'zh' ? 'English' : '中文'}>
            <Button
              type="text"
              icon={<TranslationOutlined />}
              onClick={toggleLang}
              style={{ color: '#999' }}
            >
              {lang === 'zh' ? 'EN' : '中文'}
            </Button>
          </Tooltip>
          <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenuClick }} placement="bottomRight">
            <Avatar
              size={32}
              icon={<UserOutlined />}
              src={user?.avatar_url}
              style={{ cursor: 'pointer', backgroundColor: '#a855f7' }}
            />
          </Dropdown>
        </Header>
        <Content
          style={{
            background: '#0c0c0c',
            overflow: 'auto',
            padding: isMobile ? 16 : 24,
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
