import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Typography, Button, Form, Input, Spin, Row, Col, Card, Image, Popconfirm, Space, Modal, Select, InputNumber, message } from 'antd';
import { ArrowLeftOutlined, DeleteOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons';
import * as characterApi from '@/api/characters';
import { useLocale } from '@/hooks/useLocale';
import FileUpload from '@/components/FileUpload';
import type { Character } from '@/types/character';
import { VIEW_TYPES, MAX_CHARACTER_VIEWS } from '@/utils/constants';

const { Title, Text } = Typography;
const { TextArea } = Input;

export default function CharacterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLocale();
  const characterId = Number(id);
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [generateCount, setGenerateCount] = useState(4);
  const [generateViewTypes, setGenerateViewTypes] = useState<string[]>(['front', 'side', 'back', 'expression']);
  const [generating, setGenerating] = useState(false);

  const fetchCharacter = async () => {
    setLoading(true);
    try {
      const data = await characterApi.getCharacter(characterId);
      setCharacter(data);
      form.setFieldsValue({
        name: data.name,
        description: data.description,
        visual_prompt: data.visual_prompt,
      });
    } catch {
      message.error(t('assets.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCharacter();
  }, [characterId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const values = form.getFieldsValue();
      const formData = new FormData();
      formData.append('name', values.name);
      if (values.description) formData.append('description', values.description);
      if (values.visual_prompt) formData.append('visual_prompt', values.visual_prompt);
      await characterApi.updateCharacter(characterId, formData);
      message.success(t('assets.saveSuccess'));
      fetchCharacter();
    } catch (error) {
      message.error((error as Error).message || t('assets.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateViews = async () => {
    setGenerating(true);
    try {
      await characterApi.generateViews(characterId, { count: generateCount, view_types: generateViewTypes });
      message.success(t('assets.viewGenerationStarted'));
      setGenerateModalOpen(false);
      setTimeout(fetchCharacter, 2000);
    } catch (error) {
      message.error((error as Error).message || t('assets.generateViewsFailed'));
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteView = async (viewId: number) => {
    try {
      await characterApi.deleteView(characterId, viewId);
      message.success(t('assets.viewDeleted'));
      fetchCharacter();
    } catch (error) {
      message.error((error as Error).message || t('assets.deleteViewFailed'));
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spin size="large" /></div>;
  }

  if (!character) {
    return <div style={{ textAlign: 'center', padding: 60 }}><Text type="secondary">{t('assets.characterNotFound')}</Text></div>;
  }

  const viewCount = character.views?.length || 0;
  const canGenerateMore = viewCount < MAX_CHARACTER_VIEWS;

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/assets')}>
          {t('assets.backToAssets')}
        </Button>
      </Space>

      <Row gutter={24}>
        {/* Left: Info */}
        <Col span={10}>
          <Card style={{ background: '#141414', borderColor: '#1e1e1e' }}>
            <Title level={4} style={{ color: '#fff', marginBottom: 16 }}>{t('assets.characterInfo')}</Title>
            <Form form={form} layout="vertical" onFinish={handleSave}>
              <Form.Item name="name" label={t('assets.name')} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="description" label={t('assets.characterBrief')}>
                <TextArea rows={3} placeholder={t('assets.characterBriefPlaceholder')} />
              </Form.Item>
              <Form.Item name="visual_prompt" label={t('assets.visualPrompt')}>
                <TextArea rows={3} placeholder={t('assets.visualPromptPlaceholder')} />
              </Form.Item>
              <Form.Item label={t('assets.seedImage')}>
                {character.seed_image_url && (
                  <Image src={character.seed_image_url} width={200} style={{ borderRadius: 6, marginBottom: 8 }} />
                )}
                <FileUpload category="reference" accept="image/*" onSuccess={() => fetchCharacter()}>
                  <Button icon={<PlusOutlined />}>{character.seed_image_url ? t('common.replace') : t('common.upload')}</Button>
                </FileUpload>
              </Form.Item>
              <Form.Item label={t('assets.voiceProfile')}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {character.voice_config ? JSON.stringify(character.voice_config) : t('assets.notConfigured')}
                </Text>
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={saving}>{t('common.saveChanges')}</Button>
            </Form>
          </Card>
        </Col>

        {/* Right: Views */}
        <Col span={14}>
          <Card style={{ background: '#141414', borderColor: '#1e1e1e' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Title level={4} style={{ color: '#fff', margin: 0 }}>
                {t('assets.referenceViews')} ({viewCount}/{MAX_CHARACTER_VIEWS})
              </Title>
              <Space>
                <Button icon={<ReloadOutlined />} onClick={fetchCharacter} size="small">{t('common.refresh')}</Button>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => setGenerateModalOpen(true)}
                  disabled={!canGenerateMore}
                  size="small"
                >
                  {t('assets.generateViews')}
                </Button>
              </Space>
            </div>
            <Row gutter={[12, 12]}>
              {character.views?.map((view) => (
                <Col key={view.id} span={8}>
                  <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid #2a2a2a' }}>
                    <Image src={view.image_url} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover' }} />
                    {view.view_type && (
                      <Text style={{ position: 'absolute', top: 4, left: 4, fontSize: 10, background: '#a855f7', color: '#fff', padding: '1px 6px', borderRadius: 3 }}>
                        {view.view_type}
                      </Text>
                    )}
                    <Popconfirm title={t('assets.deleteViewConfirm')} onConfirm={() => handleDeleteView(view.id)}>
                      <Button type="text" size="small" danger icon={<DeleteOutlined />}
                        style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.5)' }}
                      />
                    </Popconfirm>
                  </div>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>
      </Row>

      <Modal title={t('assets.generateCharacterViews')} open={generateModalOpen} onCancel={() => setGenerateModalOpen(false)} onOk={handleGenerateViews} confirmLoading={generating} okText={t('common.generate')}>
        <div style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>{t('assets.count')}</Text>
            <InputNumber value={generateCount} onChange={(v) => setGenerateCount(v || 4)} min={1} max={MAX_CHARACTER_VIEWS - viewCount} style={{ width: '100%' }} />
          </div>
          <div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>{t('assets.viewTypes')}</Text>
            <Select mode="multiple" value={generateViewTypes} onChange={setGenerateViewTypes} style={{ width: '100%' }} options={VIEW_TYPES.map((vt) => ({ value: vt.value, label: vt.label }))} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
