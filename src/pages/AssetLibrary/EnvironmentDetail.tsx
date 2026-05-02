import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Typography, Button, Form, Input, Spin, Card, Image, Space, message, Popconfirm } from 'antd';
import { ArrowLeftOutlined, ThunderboltOutlined, DeleteOutlined } from '@ant-design/icons';
import * as environmentApi from '@/api/environments';
import { useLocale } from '@/hooks/useLocale';
import type { Environment } from '@/types/environment';

const { Title, Text } = Typography;
const { TextArea } = Input;

export default function EnvironmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLocale();
  const environmentId = Number(id);
  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [form] = Form.useForm();

  const fetchEnvironment = async () => {
    setLoading(true);
    try {
      const data = await environmentApi.getEnvironment(environmentId);
      setEnvironment(data);
      form.setFieldsValue({ name: data.name, description: data.description, prompt: data.prompt });
    } catch {
      message.error(t('assets.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEnvironment();
  }, [environmentId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const values = form.getFieldsValue();
      const formData = new FormData();
      formData.append('name', values.name);
      if (values.description) formData.append('description', values.description);
      if (values.prompt) formData.append('prompt', values.prompt);
      await environmentApi.updateEnvironment(environmentId, formData);
      message.success(t('assets.saveSuccess'));
      fetchEnvironment();
    } catch (error) {
      message.error((error as Error).message || t('assets.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateImage = async () => {
    setGeneratingImage(true);
    try {
      await environmentApi.generateEnvironmentImage(environmentId);
      message.success(t('assets.imageGenerationStarted'));
      await fetchEnvironment();
    } catch (error) {
      message.error((error as Error).message || t('assets.generateImageFailed'));
    } finally {
      setGeneratingImage(false);
    }
  };

  const handleDeleteImage = async (imageId: number) => {
    try {
      await environmentApi.deleteEnvironmentImage(environmentId, imageId);
      message.success(t('common.deleteSuccess') || '图片已删除');
      await fetchEnvironment();
    } catch (error) {
      message.error((error as Error).message || '删除图片失败');
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spin size="large" /></div>;
  }

  if (!environment) {
    return <div style={{ textAlign: 'center', padding: 60 }}><Text type="secondary">{t('assets.environmentNotFound')}</Text></div>;
  }

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/assets')}>{t('assets.backToAssets')}</Button>
      </Space>

      <Card style={{ background: '#141414', borderColor: '#1e1e1e', maxWidth: 700 }}>
        <Title level={4} style={{ color: '#fff', marginBottom: 16 }}>{t('assets.environmentDetails')}</Title>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label={t('assets.name')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label={t('assets.description')}>
            <TextArea rows={3} placeholder={t('assets.environmentDescPlaceholder')} />
          </Form.Item>
          <Form.Item name="prompt" label={t('assets.generationPrompt')}>
            <TextArea rows={3} placeholder={t('assets.generationPromptPlaceholder')} />
          </Form.Item>
          <Form.Item label={t('assets.baseImage')}>
            <div style={{ marginBottom: 8, color: '#999', fontSize: 12 }}>
              {`Images: ${environment.images?.length ?? 0} / 20`}
            </div>
            {environment.images && environment.images.length > 0 && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                {environment.images.map((img) => (
                  <div
                    key={img.id}
                    style={{
                      position: 'relative',
                      border: '1px solid #262626',
                      borderRadius: 8,
                      overflow: 'hidden',
                    }}
                  >
                    <Image src={img.image_url} width="100%" style={{ display: 'block' }} />
                    <Popconfirm
                      title="Delete this image?"
                      onConfirm={() => handleDeleteImage(img.id)}
                      okText="Yes"
                      cancelText="No"
                    >
                      <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        style={{ position: 'absolute', top: 4, right: 4 }}
                      />
                    </Popconfirm>
                  </div>
                ))}
              </div>
            )}
            <Button
              icon={<ThunderboltOutlined />}
              onClick={handleGenerateImage}
              loading={generatingImage}
              disabled={(environment.images?.length ?? 0) >= 20}
            >
              {t('assets.aiGenerate')}
            </Button>
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>{t('common.saveChanges')}</Button>
        </Form>
      </Card>
    </div>
  );
}
