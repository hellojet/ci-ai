import { useEffect, useState } from 'react';
import { Typography, Card, Form, Input, InputNumber, Button, Row, Col, Divider, Spin, Tag, Empty, message } from 'antd';
import { SaveOutlined, ApiOutlined, PictureOutlined } from '@ant-design/icons';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAuthStore } from '@/stores/authStore';
import { useGenerationStore } from '@/stores/generationStore';
import { getModelDisplayName } from '@/types/imageModel';
import { useLocale } from '@/hooks/useLocale';

const { Title, Text, Paragraph } = Typography;

interface ApiGroupConfig {
  title: string;
  prefix: string;
  icon: React.ReactNode;
  /** true 表示只展示并发/超时，endpoint/model/api_key 改由 .env 的模型清单管理 */
  modelsManagedByEnv?: boolean;
}

// 图像 API 的 endpoint / model / api_key 改由 .env 的 AI_IMAGE_MODELS 统一管理，
// 设置页里只保留 concurrency / timeout 这类运行时策略字段 + 只读的模型清单展示。
const API_GROUPS: ApiGroupConfig[] = [
  { title: 'textApi', prefix: 'api.text', icon: <ApiOutlined /> },
  { title: 'imageApi', prefix: 'api.image', icon: <PictureOutlined />, modelsManagedByEnv: true },
  { title: 'videoApi', prefix: 'api.video', icon: <ApiOutlined /> },
  { title: 'audioApi', prefix: 'api.audio', icon: <ApiOutlined /> },
];

export default function SettingsPage() {
  const { settings, loading, fetchSettings, updateSettings, getSettingValue } = useSettingsStore();
  const user = useAuthStore((state) => state.user);
  const { fetchImageModels } = useGenerationStore();
  const imageModels = useGenerationStore((state) => state.imageModels);
  const { t } = useLocale();
  const isAdmin = user?.role === 'admin';
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
    // 拉一次图像模型清单，供"图片 API"卡片只读展示当前可选的模型
    fetchImageModels().catch(() => {
      /* silent */
    });
  }, [fetchSettings, fetchImageModels]);

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

                  {group.modelsManagedByEnv ? (
                    // 图像 API：endpoint / model / api_key 由运维在 .env 的 AI_IMAGE_MODELS 里配，
                    // 这里只做只读展示 + 保留 concurrency / timeout 两个运行时策略字段
                    <>
                      <Paragraph style={{ color: '#888', fontSize: 12, marginBottom: 12 }}>
                        {t('settings.imageModelsManagedByEnv')}
                      </Paragraph>

                      <div style={{ marginBottom: 12 }}>
                        <Text style={{ color: '#aaa', fontSize: 12, display: 'block', marginBottom: 6 }}>
                          {t('settings.availableImageModels')}
                        </Text>
                        {imageModels.length === 0 ? (
                          <Empty
                            description={
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {t('settings.imageModelsEmpty')}
                              </Text>
                            }
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                          />
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {imageModels.map((model) => (
                              <Tag
                                key={model.id}
                                color={model.is_default ? 'purple' : 'default'}
                                style={{ fontSize: 12 }}
                              >
                                {getModelDisplayName(model)}
                                {model.is_default && ` · ${t('settings.defaultModelTag')}`}
                              </Tag>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <Form.Item name={`${group.prefix}.endpoint`} label={t('settings.apiEndpoint')}>
                        <Input placeholder={t('settings.apiEndpointPlaceholder')} />
                      </Form.Item>

                      <Form.Item name={`${group.prefix}.model`} label={t('settings.model')}>
                        <Input placeholder={t('settings.modelPlaceholder')} />
                      </Form.Item>

                      <Form.Item name={`${group.prefix}.api_key`} label={t('settings.apiKey')}>
                        <Input.Password placeholder={t('settings.apiKeyPlaceholder')} />
                      </Form.Item>
                    </>
                  )}

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
