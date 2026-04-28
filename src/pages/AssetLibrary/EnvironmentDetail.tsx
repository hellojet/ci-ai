import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Typography, Button, Form, Input, Spin, Card, Image, Space, message } from 'antd';
import { ArrowLeftOutlined, ThunderboltOutlined, PlusOutlined } from '@ant-design/icons';
import * as environmentApi from '@/api/environments';
import { useLocale } from '@/hooks/useLocale';
import FileUpload from '@/components/FileUpload';
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
      setTimeout(fetchEnvironment, 3000);
    } catch (error) {
      message.error((error as Error).message || t('assets.generateImageFailed'));
    } finally {
      setGeneratingImage(false);
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
            {environment.base_image_url && (
              <Image src={environment.base_image_url} width={400} style={{ borderRadius: 8, marginBottom: 8 }} />
            )}
            <Space>
              <FileUpload category="reference" accept="image/*" onSuccess={() => fetchEnvironment()}>
                <Button icon={<PlusOutlined />}>{environment.base_image_url ? t('common.replace') : t('common.upload')}</Button>
              </FileUpload>
              <Button icon={<ThunderboltOutlined />} onClick={handleGenerateImage} loading={generatingImage}>
                {t('assets.aiGenerate')}
              </Button>
            </Space>
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>{t('common.saveChanges')}</Button>
        </Form>
      </Card>
    </div>
  );
}
