import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  Typography,
  Button,
  Form,
  Input,
  Spin,
  Row,
  Col,
  Card,
  Image,
  Popconfirm,
  Space,
  Modal,
  Select,
  InputNumber,
  Switch,
  Tooltip,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  ReloadOutlined,
  PlusOutlined,
  LoadingOutlined,
  UploadOutlined,
  ExclamationCircleOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import * as environmentApi from '@/api/environments';
import { useLocale } from '@/hooks/useLocale';
import FileUpload from '@/components/FileUpload';
import type { Environment } from '@/types/environment';
import {
  ENVIRONMENT_VIEW_TYPES,
  MAX_ENVIRONMENT_IMAGES,
} from '@/utils/constants';
import { useGenerationStore } from '@/stores/generationStore';
import { getModelDisplayName } from '@/types/imageModel';

const { Title, Text } = Typography;
const { TextArea } = Input;

// 图片生成状态的颜色映射（对齐 CharacterView 的配色）
const STATUS_BADGE_COLOR: Record<string, string> = {
  queued: '#faad14',
  generating: '#1677ff',
  failed: '#ff4d4f',
};

export default function EnvironmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLocale();
  const environmentId = Number(id);
  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  // 生成弹窗状态
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [generateCount, setGenerateCount] = useState(4);
  const [generateViewTypes, setGenerateViewTypes] = useState<string[]>([
    'wide',
    'close-up',
    'overhead',
    'low_angle',
  ]);
  const [generating, setGenerating] = useState(false);
  const [generateUseSeed, setGenerateUseSeed] = useState(false);
  const [generateModelId, setGenerateModelId] = useState<string | undefined>(undefined);

  const fetchImageModels = useGenerationStore((state) => state.fetchImageModels);
  const imageModels = useGenerationStore((state) => state.imageModels);

  // 轮询定时器：只要有 queued/generating 就定时拉取 detail
  const pollTimerRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  // 静默刷新（不动 loading spinner），用于轮询
  const refreshEnvironmentSilently = async (): Promise<Environment | null> => {
    try {
      const data = await environmentApi.getEnvironment(environmentId);
      setEnvironment(data);
      return data;
    } catch {
      return null;
    }
  };

  const fetchEnvironment = async () => {
    setLoading(true);
    try {
      const data = await environmentApi.getEnvironment(environmentId);
      setEnvironment(data);
      form.setFieldsValue({
        name: data.name,
        description: data.description,
        prompt: data.prompt,
      });
    } catch {
      message.error(t('assets.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEnvironment();
    // 预取图像模型清单，打开生成弹窗时不用再等网络
    fetchImageModels().catch(() => {
      /* silent */
    });
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [environmentId]);

  // 只要图片列表里有 queued / generating，就持续轮询；全部完成自动停止
  const schedulePollIfNeeded = (data: Environment | null) => {
    const pending = (data?.images || []).some(
      (img) => img.status === 'queued' || img.status === 'generating',
    );
    if (!pending) {
      stopPolling();
      return;
    }
    stopPolling();
    pollTimerRef.current = window.setTimeout(async () => {
      const next = await refreshEnvironmentSilently();
      schedulePollIfNeeded(next);
    }, 3000);
  };

  useEffect(() => {
    schedulePollIfNeeded(environment);
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [environment]);

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

  const handleGenerateImages = async () => {
    setGenerating(true);
    // 先缓存入参，避免 state 在关弹窗重置后丢失
    const submitViewTypes = generateViewTypes.length > 0 ? generateViewTypes : ['wide'];
    const submitCount = generateCount;
    const submitUseSeed = generateUseSeed && !!environment?.seed_image_url;
    const submitModelId = generateModelId;

    try {
      const placeholders = await environmentApi.generateEnvironmentImages(environmentId, {
        count: submitCount,
        view_types: submitViewTypes,
        use_seed_image: submitUseSeed,
        model_id: submitModelId,
      });
      setEnvironment((prev) =>
        prev ? { ...prev, images: [...(prev.images || []), ...placeholders] } : prev,
      );
      message.success(t('assets.imageGenerationStarted'));
      const next = await refreshEnvironmentSilently();
      schedulePollIfNeeded(next);
    } catch (error) {
      message.error((error as Error).message || t('assets.generateImageFailed'));
    } finally {
      setGenerateModalOpen(false);
      setGenerating(false);
    }
  };

  const openGenerateModal = () => {
    setGenerateUseSeed(!!environment?.seed_image_url);
    const defaultModel = imageModels.find((m) => m.is_default) || imageModels[0];
    setGenerateModelId(defaultModel?.id);
    setGenerateModalOpen(true);
  };

  const handleUploadImage = async (imageUrl: string) => {
    try {
      await environmentApi.uploadEnvironmentImage(environmentId, { image_url: imageUrl });
      message.success(t('assets.uploadImageSuccess'));
      fetchEnvironment();
    } catch (error) {
      message.error((error as Error).message || t('assets.uploadImageFailed'));
    }
  };

  const handleDeleteImage = async (imageId: number) => {
    try {
      await environmentApi.deleteEnvironmentImage(environmentId, imageId);
      message.success(t('assets.deleteImageSuccess'));
      fetchEnvironment();
    } catch (error) {
      message.error((error as Error).message || t('assets.deleteImageFailed'));
    }
  };

  const handleUpdateSeedImage = async (seedImageUrl: string) => {
    if (!environment) return;
    try {
      const formData = new FormData();
      formData.append('name', environment.name);
      if (environment.description) formData.append('description', environment.description);
      if (environment.prompt) formData.append('prompt', environment.prompt);
      formData.append('seed_image_url', seedImageUrl);
      await environmentApi.updateEnvironment(environmentId, formData);
      message.success(t('assets.saveSuccess'));
      fetchEnvironment();
    } catch (error) {
      message.error((error as Error).message || t('assets.saveFailed'));
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!environment) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Text type="secondary">{t('assets.environmentNotFound')}</Text>
      </div>
    );
  }

  const imageCount = environment.images?.length || 0;
  const canGenerateMore = imageCount < MAX_ENVIRONMENT_IMAGES;

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/assets')}>
          {t('assets.backToAssets')}
        </Button>
      </Space>

      <Row gutter={24}>
        {/* Left: Info + Seed Image */}
        <Col span={10}>
          <Card style={{ background: '#141414', borderColor: '#1e1e1e' }}>
            <Title level={4} style={{ color: '#fff', marginBottom: 16 }}>
              {t('assets.environmentDetails')}
            </Title>
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
              <Form.Item label={t('assets.seedImage')}>
                {environment.seed_image_url && (
                  <Image
                    src={environment.seed_image_url}
                    width={200}
                    style={{ borderRadius: 6, marginBottom: 8 }}
                  />
                )}
                <FileUpload
                  category="reference"
                  accept="image/*"
                  onSuccess={(url) => handleUpdateSeedImage(url)}
                >
                  <Button icon={<PlusOutlined />}>
                    {environment.seed_image_url ? t('common.replace') : t('common.upload')}
                  </Button>
                </FileUpload>
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={saving}>
                {t('common.saveChanges')}
              </Button>
            </Form>
          </Card>
        </Col>

        {/* Right: Image Grid */}
        <Col span={14}>
          <Card style={{ background: '#141414', borderColor: '#1e1e1e' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <Title level={4} style={{ color: '#fff', margin: 0 }}>
                {t('assets.environmentImages')} ({imageCount}/{MAX_ENVIRONMENT_IMAGES})
              </Title>
              <Space>
                <Button icon={<ReloadOutlined />} onClick={fetchEnvironment} size="small">
                  {t('common.refresh')}
                </Button>
                <FileUpload
                  category="reference"
                  accept="image/*"
                  onSuccess={(url) => handleUploadImage(url)}
                >
                  <Button icon={<UploadOutlined />} size="small" disabled={!canGenerateMore}>
                    {t('assets.uploadImage')}
                  </Button>
                </FileUpload>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={openGenerateModal}
                  disabled={!canGenerateMore}
                  size="small"
                >
                  {t('assets.aiGenerate')}
                </Button>
              </Space>
            </div>
            <Row gutter={[12, 12]}>
              {environment.images?.map((img) => {
                const isPending = img.status === 'queued' || img.status === 'generating';
                const isFailed = img.status === 'failed';
                const statusLabel =
                  img.status === 'queued'
                    ? t('assets.viewStatusQueued')
                    : img.status === 'generating'
                      ? t('assets.viewStatusGenerating')
                      : img.status === 'failed'
                        ? t('assets.viewStatusFailed')
                        : null;
                return (
                  <Col key={img.id} span={8}>
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
                      {img.image_url && !isPending && !isFailed ? (
                        <Image
                          src={img.image_url}
                          style={{ width: '100%', aspectRatio: '1', objectFit: 'cover' }}
                        />
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
                              <LoadingOutlined
                                style={{ fontSize: 28, color: STATUS_BADGE_COLOR[img.status] }}
                                spin
                              />
                              <Text
                                style={{ fontSize: 12, color: STATUS_BADGE_COLOR[img.status] }}
                              >
                                {statusLabel}
                              </Text>
                            </>
                          ) : (
                            <Tooltip title={img.error_message || statusLabel}>
                              <Space direction="vertical" align="center" size={4}>
                                <ExclamationCircleOutlined style={{ fontSize: 28 }} />
                                <Text style={{ fontSize: 12, color: '#ff4d4f' }}>
                                  {statusLabel}
                                </Text>
                              </Space>
                            </Tooltip>
                          )}
                        </div>
                      )}

                      {/* 左上角视角徽标 */}
                      {img.view_type && (
                        <Text
                          style={{
                            position: 'absolute',
                            top: 4,
                            left: 4,
                            fontSize: 10,
                            background: isPending
                              ? STATUS_BADGE_COLOR[img.status]
                              : isFailed
                                ? STATUS_BADGE_COLOR.failed
                                : '#a855f7',
                            color: '#fff',
                            padding: '1px 6px',
                            borderRadius: 3,
                          }}
                        >
                          {img.view_type}
                        </Text>
                      )}

                      {/* 右上角：参考种子图徽标 + 删除按钮 */}
                      {img.use_seed_image && (
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
                      <Popconfirm
                        title={t('assets.deleteImageConfirm')}
                        onConfirm={() => handleDeleteImage(img.id)}
                      >
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          style={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                            background: 'rgba(0,0,0,0.5)',
                          }}
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

      <Modal
        title={t('assets.generateEnvironmentImages')}
        open={generateModalOpen}
        onCancel={() => setGenerateModalOpen(false)}
        onOk={handleGenerateImages}
        confirmLoading={generating}
        okText={t('common.generate')}
      >
        <div style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
              {t('assets.count', { count: generateCount })}
            </Text>
            <InputNumber
              value={generateCount}
              onChange={(v) => setGenerateCount(v || 4)}
              min={1}
              max={Math.max(1, MAX_ENVIRONMENT_IMAGES - imageCount)}
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
              {t('assets.environmentViewTypes')}
            </Text>
            <Select
              mode="multiple"
              value={generateViewTypes}
              onChange={setGenerateViewTypes}
              style={{ width: '100%' }}
              options={ENVIRONMENT_VIEW_TYPES.map((vt) => ({
                value: vt.value,
                label: vt.label,
              }))}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
              {t('assets.imageModel')}
            </Text>
            <Select
              value={generateModelId}
              onChange={setGenerateModelId}
              style={{ width: '100%' }}
              placeholder={t('assets.imageModelPlaceholder')}
              notFoundContent={<Text type="secondary">{t('assets.noImageModels')}</Text>}
              options={imageModels.map((m) => ({
                value: m.id,
                label: m.is_default
                  ? `${getModelDisplayName(m)} · ${t('settings.defaultModelTag')}`
                  : getModelDisplayName(m),
              }))}
              disabled={imageModels.length === 0}
            />
          </div>
          {/* 参考种子图片 Switch：种子图缺失时禁用并提示 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <Switch
              checked={generateUseSeed && !!environment?.seed_image_url}
              disabled={!environment?.seed_image_url}
              onChange={setGenerateUseSeed}
            />
            <Text style={{ color: environment?.seed_image_url ? '#fff' : '#888' }}>
              {t('assets.useSeedImage')}
            </Text>
            {!environment?.seed_image_url && (
              <Tooltip title={t('assets.environmentSeedMissingTip')}>
                <ExclamationCircleOutlined style={{ color: '#faad14' }} />
              </Tooltip>
            )}
          </div>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
            {t('assets.environmentSeedImageTip')}
          </Text>
        </div>
      </Modal>
    </div>
  );
}
