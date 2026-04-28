import { Form, Input, Button, Typography, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate, Link } from 'react-router';
import { useAuthStore } from '@/stores/authStore';
import { LogoIcon } from '@/components/Icons';
import { useLocale } from '@/hooks/useLocale';

const { Title, Text } = Typography;

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register, loading } = useAuthStore();
  const { t } = useLocale();

  const handleSubmit = async (values: { username: string; password: string }) => {
    try {
      await register(values.username, values.password);
      message.success(t('register.registerSuccess'));
      navigate('/login');
    } catch (error) {
      message.error((error as Error).message || t('register.registerFailed'));
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
          <Text type="secondary">{t('register.subtitle')}</Text>
        </div>

        <Form layout="vertical" onFinish={handleSubmit} autoComplete="off">
          <Form.Item
            name="username"
            rules={[
              { required: true, message: t('register.usernameRequired') },
              { min: 3, max: 64, message: t('register.usernameLength') },
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder={t('register.usernamePlaceholder')} size="large" />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[
              { required: true, message: t('register.passwordRequired') },
              { min: 6, max: 128, message: t('register.passwordLength') },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder={t('register.passwordPlaceholder')} size="large" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            dependencies={['password']}
            rules={[
              { required: true, message: t('register.confirmRequired') },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error(t('register.passwordMismatch')));
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder={t('register.confirmPasswordPlaceholder')} size="large" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={loading}>
              {t('register.signUp')}
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center' }}>
          <Text type="secondary">
            {t('register.hasAccount')}{' '}
            <Link to="/login" style={{ color: '#a855f7' }}>
              {t('register.signIn')}
            </Link>
          </Text>
        </div>
      </div>
    </div>
  );
}
