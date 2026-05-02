import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Typography, Button, Form, Input, Spin, Card, Image, Space, message } from 'antd';
import { ArrowLeftOutlined, PlusOutlined, ThunderboltOutlined } from '@ant-design/icons';
import * as styleApi from '@/api/styles';
import { useLocale } from '@/hooks/useLocale';
import FileUpload from '@/components/FileUpload';
import type { Style } from '@/types/style';

const { Title, Text } = Typography;
const { TextArea } = Input;

export default function StyleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLocale();
  const styleId = Number(id);
  const [style, setStyle] = useState<Style | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [form] = Form.useForm();

  const fetchStyle = async () => {
    setLoading(true);
    try {
      const data = await styleApi.getStyle(styleId);
      setStyle(data);
      form.setFieldsValue({ name: data.name, prompt: data.prompt });
    } catch {
      message.error(t('assets.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStyle();
  }, [styleId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const values = form.getFieldsValue();
      const formData = new FormData();
      formData.append('name', values.name);
      formData.append('prompt', values.prompt);
      await styleApi.updateStyle(styleId, formData);
      message.success(t('assets.saveSuccess'));
      fetchStyle();
    } catch (error) {
      message.error((error as Error).message || t('assets.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateReferenceImage = async () => {
    setGenerating(true);
    try {
      const updated = await styleApi.generateStyleImage(styleId);
      setStyle(updated);
      message.success(t('assets.imageGenerationStarted') || '参考图片已生成');
    } catch (error) {
      message.error((error as Error).message || '生成参考图片失败');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spin size="large" /></div>;
  }

  if (!style) {
    return <div style={{ textAlign: 'center', padding: 60 }}><Text type="secondary">{t('assets.styleNotFound')}</Text></div>;
  }

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/assets')}>{t('assets.backToAssets')}</Button>
      </Space>

      <Card style={{ background: '#141414', borderColor: '#1e1e1e', maxWidth: 700 }}>
        <Title level={4} style={{ color: '#fff', marginBottom: 16 }}>{t('assets.styleDetails')}</Title>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label={t('assets.name')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="prompt" label={t('assets.stylePrompt')} rules={[{ required: true }]}>
            <TextArea rows={4} placeholder={t('assets.stylePromptPlaceholder')} />
          </Form.Item>
          <Form.Item label={t('assets.referenceImage')}>
            {style.reference_image_url && (
              <Image src={style.reference_image_url} width={400} style={{ borderRadius: 8, marginBottom: 8 }} />
            )}
            <Space>
              <FileUpload
                category="reference"
                accept="image/*"
                onSuccess={async (url) => {
                  try {
                    const formData = new FormData();
                    formData.append('name', style.name);
                    if (style.prompt) formData.append('prompt', style.prompt);
                    formData.append('reference_image_url', url);
                    await styleApi.updateStyle(styleId, formData);
                    message.success(t('assets.saveSuccess'));
                    fetchStyle();
                  } catch (error) {
                    message.error((error as Error).message || t('assets.saveFailed'));
                  }
                }}
              >
                <Button icon={<PlusOutlined />}>
                  {style.reference_image_url ? t('common.replace') : t('common.upload')}
                </Button>
              </FileUpload>
              <Button
                icon={<ThunderboltOutlined />}
                onClick={handleGenerateReferenceImage}
                loading={generating}
              >
                {t('assets.aiGenerate') || 'AI Generate'}
              </Button>
            </Space>
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>{t('common.saveChanges')}</Button>
        </Form>
      </Card>
    </div>
  );
}
