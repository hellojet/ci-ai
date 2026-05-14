import { Button, Dropdown, Avatar, Tooltip } from 'antd';
import { TranslationOutlined, UserOutlined, LogoutOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router';
import { useAuthStore } from '@/stores/authStore';
import { useLocale } from '@/hooks/useLocale';
import { LogoIcon } from '@/components/Icons';
import type { MenuProps } from 'antd';

interface Props {
  onRequestTrial: () => void;
}

export default function LandingHeader({ onRequestTrial }: Props) {
  const navigate = useNavigate();
  const { user, token, logout } = useAuthStore();
  const { t, lang, toggleLang } = useLocale();

  const isAuthed = Boolean(token && user);

  const userMenuItems: MenuProps['items'] = [
    { key: 'profile', icon: <UserOutlined />, label: user?.username || 'User', disabled: true },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: t('layout.logout'), danger: true },
  ];

  const handleUserMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'logout') {
      logout();
    }
  };

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: 'rgba(12, 12, 12, 0.6)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '0 24px',
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          onClick={() => navigate('/')}
        >
          <LogoIcon />
          <span style={{ color: '#fff', fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>
            CI.AI
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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

          {isAuthed ? (
            <>
              <Dropdown
                menu={{ items: userMenuItems, onClick: handleUserMenuClick }}
                placement="bottomRight"
              >
                <Avatar
                  size={32}
                  icon={<UserOutlined />}
                  src={user?.avatar_url}
                  style={{ cursor: 'pointer', backgroundColor: '#a855f7' }}
                />
              </Dropdown>
              <Button type="primary" onClick={() => navigate('/projects')}>
                {t('landing.header.enterApp')}
              </Button>
            </>
          ) : (
            <>
              <Button type="text" onClick={() => navigate('/login')} style={{ color: '#ddd' }}>
                {t('landing.header.signIn')}
              </Button>
              <Button type="primary" onClick={onRequestTrial}>
                {t('landing.header.requestTrial')}
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
