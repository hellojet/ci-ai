import { useEffect, useState } from 'react';
import { Typography, Card, Form, Input, InputNumber, Button, Row, Col, Divider, Spin, message } from 'antd';
import { SaveOutlined, ApiOutlined } from '@ant-design/icons';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAuthStore } from '@/stores/authStore';
import { useLocale } from '@/hooks/useLocale';

const { Title, Text } = Typography;

interface ApiGroupConfig {
  title: string;
  prefix: string;
  icon: React.ReactNode;
}

const API_GROUPS: ApiGroupConfig[] = [
  { title: 'textApi', prefix: 'api.text', icon: <ApiOutlined /> },
  { title: 'imageApi', prefix: 'api.image', icon: <ApiOutlined /> },
  { title: 'videoApi', prefix: 'api.video', icon: <ApiOutlined /> },
  { title: 'audioApi', prefix: 'api.audio', icon: <ApiOutlined /> },
];

export default function SettingsPage() {
  const { settings, loading, fetchSettings, updateSettings, getSettingValue } = useSettingsStore();
  const user = useAuthStore((state) => state.user);
  const { t } = useLocale();
  const isAdmin = user?.role === 'admin';
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (settings.length > 0) {
      const values: Record<string, unknown> = {};
      for (const setting of settings) {
        values[setting.key] = setting.value;
      }
      form.setFieldsValue(values);
    }
  }, [settings, form]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const values = form.getFieldsValue();
      const settingsToUpdate = Object.entries(values)
        .filter(([, value]) => value !== undefined && value !== '')
        .map(([key, value]) => ({ key, value: value as string | number }));
      await updateSettings(settingsToUpdate);
      message.success(t('settings.saveSuccess'));
    } catch (error) {
      message.error((error as Error).message || t('settings.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ color: '#fff', margin: 0 }}>
          {t('settings.title')}
        </Title>
        {isAdmin && (
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
            {t('settings.saveAll')}
          </Button>
        )}
      </div>

      <Spin spinning={loading}>
        <Form form={form} layout="vertical" disabled={!isAdmin}>
          <Row gutter={[16, 16]}>
            {API_GROUPS.map((group) => (
              <Col key={group.prefix} xs={24} lg={12}>
                <Card style={{ background: '#141414', borderColor: '#1e1e1e', height: '100%' }}>
                  <Title level={5} style={{ color: '#fff', marginBottom: 16 }}>
                    {group.icon} {t(`settings.${group.title}`)}
                  </Title>

                  <Form.Item name={`${group.prefix}.endpoint`} label={t('settings.apiEndpoint')}>
                    <Input placeholder={t('settings.apiEndpointPlaceholder')} />
                  </Form.Item>

                  <Form.Item name={`${group.prefix}.model`} label={t('settings.model')}>
                    <Input placeholder={t('settings.modelPlaceholder')} />
                  </Form.Item>

                  <Form.Item name={`${group.prefix}.api_key`} label={t('settings.apiKey')}>
                    <Input.Password placeholder={t('settings.apiKeyPlaceholder')} />
                  </Form.Item>

                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item name={`${group.prefix}.concurrency`} label={t('settings.concurrency')}>
                        <InputNumber min={1} max={10} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name={`${group.prefix}.timeout`} label={t('settings.timeout')}>
                        <InputNumber min={10} max={600} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                  </Row>

                  {!isAdmin && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {t('settings.currentConcurrency')} {getSettingValue(`${group.prefix}.concurrency`) || 1}
                    </Text>
                  )}
                </Card>
              </Col>
            ))}
          </Row>
        </Form>
      </Spin>

      {!isAdmin && (
        <>
          <Divider style={{ borderColor: '#1e1e1e' }} />
          <Text type="secondary">{t('settings.adminOnly')}</Text>
        </>
      )}
    </div>
  );
}
