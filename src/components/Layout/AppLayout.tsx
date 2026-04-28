import { Layout, Menu, Avatar, Dropdown, Button, Tooltip } from 'antd';
import {
  FolderOpenOutlined,
  UserOutlined,
  SettingOutlined,
  TeamOutlined,
  AppstoreOutlined,
  LogoutOutlined,
  TranslationOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router';
import { useAuthStore } from '@/stores/authStore';
import { useLocale } from '@/hooks/useLocale';
import CreditsDisplay from '@/components/CreditsDisplay';
import { LogoIcon } from '@/components/Icons';
import type { MenuProps } from 'antd';

const { Sider, Header, Content } = Layout;

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { t, lang, toggleLang } = useLocale();

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
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: t('layout.settings'),
    },
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

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    const routeMap: Record<string, string> = {
      projects: '/projects',
      assets: '/assets',
      settings: '/settings',
      admin: '/admin/users',
    };
    if (routeMap[key]) {
      navigate(routeMap[key]);
    }
  };

  const handleUserMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'logout') {
      logout();
      navigate('/login');
    }
  };

  return (
    <Layout style={{ height: '100vh', background: '#0c0c0c' }}>
      <Sider
        width={200}
        style={{
          background: '#0c0c0c',
          borderRight: '1px solid #1e1e1e',
        }}
      >
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 20px',
            borderBottom: '1px solid #1e1e1e',
          }}
        >
          <LogoIcon />
          <span style={{ color: '#fff', fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>CI.AI</span>
        </div>
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
        />
      </Sider>
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
            padding: 24,
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
