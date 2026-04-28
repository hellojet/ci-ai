import { Form, Input, Button, Typography, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate, Link } from 'react-router';
import { useAuthStore } from '@/stores/authStore';
import { LogoIcon } from '@/components/Icons';
import { useLocale } from '@/hooks/useLocale';

const { Title, Text } = Typography;

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, loading } = useAuthStore();
  const { t } = useLocale();

  const handleSubmit = async (values: { username: string; password: string }) => {
    try {
      await login(values.username, values.password);
      message.success(t('login.loginSuccess'));
      navigate('/projects');
    } catch (error) {
      message.error((error as Error).message || t('login.loginFailed'));
    }
  };

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0c0c0c',
      }}
    >
      <div
        style={{
          width: 400,
          padding: 40,
          background: '#141414',
          borderRadius: 12,
          border: '1px solid #1e1e1e',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
            <LogoIcon />
            <Title level={3} style={{ margin: 0, color: '#fff' }}>
              CI.AI
            </Title>
          </div>
          <Text type="secondary">{t('login.subtitle')}</Text>
        </div>

        <Form layout="vertical" onFinish={handleSubmit} autoComplete="off">
          <Form.Item
            name="username"
            rules={[{ required: true, message: t('login.usernameRequired') }]}
          >
            <Input prefix={<UserOutlined />} placeholder={t('login.usernamePlaceholder')} size="large" />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[{ required: true, message: t('login.passwordRequired') }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder={t('login.passwordPlaceholder')} size="large" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={loading}>
              {t('login.signIn')}
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center' }}>
          <Text type="secondary">
            {t('login.noAccount')}{' '}
            <Link to="/register" style={{ color: '#a855f7' }}>
              {t('login.signUp')}
            </Link>
          </Text>
        </div>
      </div>
    </div>
  );
}
