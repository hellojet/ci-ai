import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Typography, Button, Form, Input, Spin, Row, Col, Card, Image, Popconfirm, Space, Modal, Select, InputNumber, Switch, Tooltip, message } from 'antd';
import { ArrowLeftOutlined, DeleteOutlined, ReloadOutlined, PlusOutlined, LoadingOutlined, UploadOutlined, ExclamationCircleOutlined, LinkOutlined } from '@ant-design/icons';
import * as characterApi from '@/api/characters';
import { useLocale } from '@/hooks/useLocale';
import FileUpload from '@/components/FileUpload';
import type { Character } from '@/types/character';
import { VIEW_TYPES, MAX_CHARACTER_VIEWS } from '@/utils/constants';

const { Title, Text } = Typography;
const { TextArea } = Input;

// 视图生成状态的颜色映射
const STATUS_BADGE_COLOR: Record<string, string> = {
  queued: '#faad14',
  generating: '#1677ff',
  failed: '#ff4d4f',
};

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
  // 生成时是否参考种子图；打开弹窗时根据 seed 是否存在初始化
  const [generateUseSeed, setGenerateUseSeed] = useState(false);
  // 用 ref 维护轮询定时器，避免多次启动重复轮询
  const pollTimerRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  // 只做一次静默刷新（不动 loading spinner），用于轮询
  const refreshCharacterSilently = async (): Promise<Character | null> => {
    try {
      const data = await characterApi.getCharacter(characterId);
      setCharacter(data);
      return data;
    } catch {
      return null;
    }
  };

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
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId]);

  // 当前视图列表里只要有 queued / generating，就持续轮询；全部完成自动停止
  const schedulePollIfNeeded = (data: Character | null) => {
    const pending = (data?.views || []).some((v) => v.status === 'queued' || v.status === 'generating');
    if (!pending) {
      stopPolling();
      return;
    }
    stopPolling();
    pollTimerRef.current = window.setTimeout(async () => {
      const next = await refreshCharacterSilently();
      schedulePollIfNeeded(next);
    }, 3000);
  };

  useEffect(() => {
    schedulePollIfNeeded(character);
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character]);

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
    // 无论成功失败都关弹窗：失败的占位/错误提示会体现在视图卡片或顶部 message 里
    // 先缓存一份入参，避免 state 在关弹窗重置后丢失
    const submitViewTypes = generateViewTypes.length > 0 ? generateViewTypes : ['front'];
    const submitCount = generateCount;
    const submitUseSeed = generateUseSeed && !!character?.seed_image_url;

    try {
      // 后端立即返回占位 view(status=queued)，把它们合入本地 state
      const placeholders = await characterApi.generateViews(characterId, {
        count: submitCount,
        view_types: submitViewTypes,
        use_seed_image: submitUseSeed,
      });
      setCharacter((prev) => (prev ? { ...prev, views: [...(prev.views || []), ...placeholders] } : prev));
      message.success(t('assets.viewGenerationStarted'));
      // 立即触发一轮静默刷新（防止占位和真实状态不同步），随后进入轮询
      const next = await refreshCharacterSilently();
      schedulePollIfNeeded(next);
    } catch (error) {
      // 后端挂 / 超时 / Redis 连不上等异常路径：弹窗照样关，错误以 message 告知用户
      message.error((error as Error).message || t('assets.generateViewsFailed'));
    } finally {
      setGenerateModalOpen(false);
      setGenerating(false);
    }
  };

  const openGenerateModal = () => {
    // 每次打开弹窗时，根据当前角色是否有种子图重新决定默认值
    setGenerateUseSeed(!!character?.seed_image_url);
    setGenerateModalOpen(true);
  };

  const handleUploadView = async (imageUrl: string) => {
    try {
      await characterApi.uploadView(characterId, { image_url: imageUrl });
      message.success(t('assets.uploadViewSuccess'));
      fetchCharacter();
    } catch (error) {
      message.error((error as Error).message || t('assets.uploadViewFailed'));
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
                <FileUpload
                  category="reference"
                  accept="image/*"
                  onSuccess={async (url) => {
                    try {
                      const formData = new FormData();
                      formData.append('name', character.name);
                      if (character.description) formData.append('description', character.description);
                      if (character.visual_prompt) formData.append('visual_prompt', character.visual_prompt);
                      formData.append('seed_image_url', url);
                      await characterApi.updateCharacter(characterId, formData);
                      message.success(t('assets.saveSuccess'));
                      fetchCharacter();
                    } catch (error) {
                      message.error((error as Error).message || t('assets.saveFailed'));
                    }
                  }}
                >
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
                <FileUpload
                  category="reference"
                  accept="image/*"
                  onSuccess={(url) => handleUploadView(url)}
                >
                  <Button icon={<UploadOutlined />} size="small" disabled={!canGenerateMore}>
                    {t('assets.uploadView')}
                  </Button>
                </FileUpload>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={openGenerateModal}
                  disabled={!canGenerateMore}
                  size="small"
                >
                  {t('assets.generateViews')}
                </Button>
              </Space>
            </div>
            <Row gutter={[12, 12]}>
              {character.views?.map((view) => {
                const isPending = view.status === 'queued' || view.status === 'generating';
                const isFailed = view.status === 'failed';
                const statusLabel =
                  view.status === 'queued'
                    ? t('assets.viewStatusQueued')
                    : view.status === 'generating'
                      ? t('assets.viewStatusGenerating')
                      : view.status === 'failed'
                        ? t('assets.viewStatusFailed')
                        : null;
                return (
                  <Col key={view.id} span={8}>
                    <div
                      style={{
                        position: 'relative',
                        borderRadius: 8,
                        overflow: 'hidden',
                        border: '1px solid #2a2a2a',
                        aspectRatio: '1',
                        background: '#0f0f0f',
                      }}
                    >
                      {/* 图片或占位 */}
                      {view.image_url && !isPending && !isFailed ? (
                        <Image src={view.image_url} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover' }} />
                      ) : (
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            color: isFailed ? '#ff4d4f' : '#888',
                          }}
                        >
                          {isPending ? (
                            <>
                              <LoadingOutlined style={{ fontSize: 28, color: STATUS_BADGE_COLOR[view.status] }} spin />
                              <Text style={{ fontSize: 12, color: STATUS_BADGE_COLOR[view.status] }}>{statusLabel}</Text>
                            </>
                          ) : (
                            <Tooltip title={view.error_message || statusLabel}>
                              <Space direction="vertical" align="center" size={4}>
                                <ExclamationCircleOutlined style={{ fontSize: 28 }} />
                                <Text style={{ fontSize: 12, color: '#ff4d4f' }}>{statusLabel}</Text>
                              </Space>
                            </Tooltip>
                          )}
                        </div>
                      )}

                      {/* 左上角类型徽标 */}
                      {view.view_type && (
                        <Text
                          style={{
                            position: 'absolute',
                            top: 4,
                            left: 4,
                            fontSize: 10,
                            background: isPending
                              ? STATUS_BADGE_COLOR[view.status]
                              : isFailed
                                ? STATUS_BADGE_COLOR.failed
                                : '#a855f7',
                            color: '#fff',
                            padding: '1px 6px',
                            borderRadius: 3,
                          }}
                        >
                          {view.view_type}
                        </Text>
                      )}

                      {/* 右上角：参考种子图徽标（若有）+ 删除按钮 */}
                      {view.use_seed_image && (
                        <Tooltip title={t('assets.refSeedBadgeTip')}>
                          <span
                            style={{
                              position: 'absolute',
                              top: 4,
                              right: 32,
                              background: 'rgba(22, 119, 255, 0.85)',
                              color: '#fff',
                              padding: '1px 6px',
                              borderRadius: 3,
                              fontSize: 10,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 2,
                            }}
                          >
                            <LinkOutlined style={{ fontSize: 10 }} />
                            {t('assets.refSeedBadge')}
                          </span>
                        </Tooltip>
                      )}
                      <Popconfirm title={t('assets.deleteViewConfirm')} onConfirm={() => handleDeleteView(view.id)}>
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.5)' }}
                        />
                      </Popconfirm>
                    </div>
                  </Col>
                );
              })}
            </Row>
          </Card>
        </Col>
      </Row>

      <Modal title={t('assets.generateCharacterViews')} open={generateModalOpen} onCancel={() => setGenerateModalOpen(false)} onOk={handleGenerateViews} confirmLoading={generating} okText={t('common.generate')}>
        <div style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>{t('assets.count', { count: generateCount })}</Text>
            <InputNumber value={generateCount} onChange={(v) => setGenerateCount(v || 4)} min={1} max={MAX_CHARACTER_VIEWS - viewCount} style={{ width: '100%' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>{t('assets.viewTypes')}</Text>
            <Select mode="multiple" value={generateViewTypes} onChange={setGenerateViewTypes} style={{ width: '100%' }} options={VIEW_TYPES.map((vt) => ({ value: vt.value, label: vt.label }))} />
          </div>
          {/* 参考种子图片 Switch：种子图缺失时禁用并提示 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <Switch
              checked={generateUseSeed && !!character?.seed_image_url}
              disabled={!character?.seed_image_url}
              onChange={setGenerateUseSeed}
            />
            <Text style={{ color: character?.seed_image_url ? '#fff' : '#888' }}>
              {t('assets.useSeedImage')}
            </Text>
            {!character?.seed_image_url && (
              <Tooltip title={t('assets.seedImageMissingTip')}>
                <ExclamationCircleOutlined style={{ color: '#faad14' }} />
              </Tooltip>
            )}
          </div>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
            {t('assets.useSeedImageTip')}
          </Text>
        </div>
      </Modal>
    </div>
  );
}
