import { useState, useEffect, useMemo } from 'react';
import { Drawer, Form, Input, Select, Button, Typography, Space, Divider, Tag, Empty, Image, Collapse, Switch, message } from 'antd';
import { SaveOutlined, EyeOutlined, CheckCircleFilled, ReloadOutlined } from '@ant-design/icons';
import type {
  Shot,
  PromptPreview,
  PromptModuleSwitches,
  PromptModuleKey,
  PromptType,
} from '@/types/shot';
import { PROMPT_MODULE_META, DEFAULT_PROMPT_MODULES } from '@/types/shot';
import type { Character, CharacterView } from '@/types/character';
import type { EnvironmentImage } from '@/types/environment';
import { useProjectStore } from '@/stores/projectStore';
import { useAssetStore } from '@/stores/assetStore';
import { CAMERA_ANGLES } from '@/utils/constants';
import * as shotApi from '@/api/shots';
import * as characterApi from '@/api/characters';
import * as environmentApi from '@/api/environments';
import ImageSelector from './ImageSelector';
import VideoSelector from './VideoSelector';

const { TextArea } = Input;
const { Text, Paragraph } = Typography;

interface ShotEditorProps {
  shot: Shot | null;
  projectId: number;
  open: boolean;
  onClose: () => void;
}

export default function ShotEditor({ shot, projectId, open, onClose }: ShotEditorProps) {
  const { updateShot, currentProject, lockImage, lockVideo } = useProjectStore();
  const { characters, fetchCharacters } = useAssetStore();
  const [form] = Form.useForm();
  // 图片 / 视频两份独立的 prompt 预览 + loading + 开关 + 自定义文本
  const [imagePromptPreview, setImagePromptPreview] = useState<PromptPreview | null>(null);
  const [videoPromptPreview, setVideoPromptPreview] = useState<PromptPreview | null>(null);
  const [loadingImagePrompt, setLoadingImagePrompt] = useState(false);
  const [loadingVideoPrompt, setLoadingVideoPrompt] = useState(false);
  const [imageModules, setImageModules] = useState<PromptModuleSwitches>(DEFAULT_PROMPT_MODULES);
  const [videoModules, setVideoModules] = useState<PromptModuleSwitches>(DEFAULT_PROMPT_MODULES);
  const [customImagePrompt, setCustomImagePrompt] = useState<string>('');
  const [customVideoPrompt, setCustomVideoPrompt] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // 当前已选角色 id 列表（同步 form 字段 character_ids）
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<number[]>([]);
  // 每个角色 id 锁定的 view id：{ [characterId]: viewId }
  const [charViewLockMap, setCharViewLockMap] = useState<Record<number, number>>({});
  // 角色详情（含 views）缓存：{ [characterId]: Character }
  const [charDetailMap, setCharDetailMap] = useState<Record<number, Character>>({});
  // 场景参考图：锁定的 EnvironmentImage id
  const [lockedEnvImageId, setLockedEnvImageId] = useState<number | null>(null);
  // 当前分镜所属场景的 environment（含 images）
  const [sceneEnvImages, setSceneEnvImages] = useState<EnvironmentImage[]>([]);

  // 从 currentProject 反查当前 shot 所属 scene，再拿到 environment
  const currentScene = useMemo(() => {
    if (!shot || !currentProject) return null;
    return currentProject.scenes.find((scene) => scene.id === shot.scene_id) ?? null;
  }, [shot?.id, shot?.scene_id, currentProject]);

  useEffect(() => {
    if (shot && open) {
      const initialCharIds = shot.characters.map((char) => char.id);
      form.setFieldsValue({
        title: shot.title,
        narration: shot.narration,
        dialogue: shot.dialogue,
        subtitle: shot.subtitle,
        action_description: shot.action_description,
        camera_angle: shot.camera_angle,
        character_ids: initialCharIds,
      });
      setSelectedCharacterIds(initialCharIds);

      // 初始化每个角色锁定的 view：以 shot.ref_character_view_ids 为准，
      // 旧数据只有 ref_character_view_id 时也兼容读进来（放到"未知角色"键也没关系，
      // 下面 buildInitialCharViewLockMap 会根据 view.character_id 归位）
      const refViewIds: number[] = shot.ref_character_view_ids
        ?? (shot.ref_character_view_id ? [shot.ref_character_view_id] : []);
      // 先占位，等拉完角色详情后再根据 view.character_id 归位
      setCharViewLockMap({});

      // 场景参考图
      setLockedEnvImageId(shot.ref_environment_image_id ?? null);

      // 提示词模块开关：null 视为全开
      setImageModules({ ...DEFAULT_PROMPT_MODULES, ...(shot.prompt_modules_image ?? {}) });
      setVideoModules({ ...DEFAULT_PROMPT_MODULES, ...(shot.prompt_modules_video ?? {}) });
      // 自定义提示词
      setCustomImagePrompt(shot.custom_prompt_image ?? '');
      setCustomVideoPrompt(shot.custom_prompt_video ?? '');

      // 拉资产基础数据（角色列表）
      fetchCharacters();

      // 拉每个已选角色的详情（含 views）
      initialCharIds.forEach((charId) => {
        loadCharacterDetail(charId, refViewIds);
      });

      // 同时拉图片 + 视频两份提示词预览
      fetchPrompt('image');
      fetchPrompt('video');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot?.id, open]);

  // 分镜所属场景的 environment 图片：跟 scene / environment_id 联动
  // 每次 scene 切换（包括"从未关联到刚关联"）都主动拉一次最新 environment，
  // 不依赖 currentProject 里是否带了 environment.images —— 避免关联场景后列表不刷新
  //
  // 兼容两种后端返回形态：扁平字段 environment_id 或嵌套对象 environment.id
  // （历史上 SceneOut 漏了 environment_id 字段，刚补；此处同时兜底避免环境不一致）
  useEffect(() => {
    if (!open) return;
    const envId = currentScene?.environment_id ?? currentScene?.environment?.id;
    if (!envId) {
      setSceneEnvImages([]);
      return;
    }
    // 先用 currentProject 里已有的 environment.images 做乐观渲染（如果有）
    const cachedImages = currentScene?.environment?.images;
    if (cachedImages?.length) {
      setSceneEnvImages(
        cachedImages.filter((img) => img.status === 'completed' && !!img.image_url)
      );
    }
    // 无论缓存有无，都主动拉一次最新数据覆盖（用 cancelled 防止快速切换时旧请求回写新状态）
    let cancelled = false;
    environmentApi
      .getEnvironment(envId)
      .then((env) => {
        if (cancelled) return;
        setSceneEnvImages(
          (env.images ?? []).filter((img) => img.status === 'completed' && !!img.image_url)
        );
      })
      .catch(() => {
        if (!cancelled) setSceneEnvImages((prev) => prev);
      });
    return () => {
      cancelled = true;
    };
  }, [open, shot?.scene_id, currentScene?.environment_id, currentScene?.environment?.id]);

  /** 拉取单个角色详情，并根据 refViewIds 归位到 charViewLockMap */
  const loadCharacterDetail = async (characterId: number, refViewIds: number[]) => {
    try {
      const char = await characterApi.getCharacter(characterId);
      setCharDetailMap((prev) => ({ ...prev, [characterId]: char }));
      // 从已保存的 refViewIds 中挑出属于这个角色的那一张（若有），落到 charViewLockMap
      const matchedView = (char.views ?? []).find((v) => refViewIds.includes(v.id));
      if (matchedView) {
        setCharViewLockMap((prev) => ({ ...prev, [characterId]: matchedView.id }));
      }
    } catch {
      // 拉失败不阻塞编辑器，用户照样能切角色
    }
  };

  const fetchPrompt = async (type: PromptType) => {
    if (!shot) return;
    const setLoading = type === 'image' ? setLoadingImagePrompt : setLoadingVideoPrompt;
    const setPreview = type === 'image' ? setImagePromptPreview : setVideoPromptPreview;
    setLoading(true);
    try {
      const result = await shotApi.getShotPrompt(projectId, shot.id, type);
      setPreview(result);
    } catch {
      // prompt preview may not be available yet
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!shot) return;
    setSaving(true);
    try {
      const values = form.getFieldsValue();
      // 组装角色参考图列表：只收"当前还被选中"的角色锁定的 view
      const refCharacterViewIds = selectedCharacterIds
        .map((charId) => charViewLockMap[charId])
        .filter((vid): vid is number => typeof vid === 'number');
      await updateShot(shot.id, {
        ...values,
        ref_character_view_ids: refCharacterViewIds,
        ref_environment_image_id: lockedEnvImageId,
        prompt_modules_image: imageModules,
        prompt_modules_video: videoModules,
        // 空串显式发出去，让后端清空 custom 字段
        custom_prompt_image: customImagePrompt,
        custom_prompt_video: customVideoPrompt,
      });
      message.success('镜头已更新');
      // 保存后重拉两份预览，让前端显示与服务器一致
      fetchPrompt('image');
      fetchPrompt('video');
    } catch (error) {
      message.error((error as Error).message || '更新镜头失败');
    } finally {
      setSaving(false);
    }
  };

  /** 切换某个模块开关 */
  const handleToggleModule = (type: PromptType, key: PromptModuleKey, value: boolean) => {
    if (type === 'image') {
      setImageModules((prev) => ({ ...prev, [key]: value }));
    } else {
      setVideoModules((prev) => ({ ...prev, [key]: value }));
    }
  };

  /** 点击"刷新"：
   *  - 若当前有自定义提示词：立即清空 UI + 落库（custom_prompt_<type>=""），然后重拉预览
   *  - 若当前无自定义：仅重拉预览（用最新模块开关结果）
   *  这样用户点完刷新就能直接看到真实生效的 prompt，不需要再点保存。
   */
  const handleResetCustomPrompt = async (type: PromptType) => {
    if (!shot) return;
    const hasCustom =
      type === 'image' ? !!customImagePrompt.trim() : !!customVideoPrompt.trim();

    if (hasCustom) {
      try {
        // 落库清空：只更新 custom_prompt_<type> 一个字段，避免覆盖用户其它未保存改动
        await updateShot(shot.id, {
          [type === 'image' ? 'custom_prompt_image' : 'custom_prompt_video']: '',
        } as Parameters<typeof updateShot>[1]);
        if (type === 'image') {
          setCustomImagePrompt('');
        } else {
          setCustomVideoPrompt('');
        }
        message.success('已清空自定义提示词');
      } catch (error) {
        message.error((error as Error).message || '清空自定义提示词失败');
        return;
      }
    }
    fetchPrompt(type);
  };

  /** 多选角色变化：同步状态 + 拉新角色详情 + 清理已取消角色的锁定 */
  const handleCharacterIdsChange = (value: number[]) => {
    setSelectedCharacterIds(value);
    // 清掉已取消角色的锁定
    setCharViewLockMap((prev) => {
      const next: Record<number, number> = {};
      value.forEach((charId) => {
        if (prev[charId] !== undefined) next[charId] = prev[charId];
      });
      return next;
    });
    // 拉未加载过详情的新角色
    value.forEach((charId) => {
      if (!charDetailMap[charId]) {
        loadCharacterDetail(charId, []);
      }
    });
  };

  /** 锁定/切换/取消某个角色下某张 view 作为该角色的参考图 */
  const handleToggleCharView = (characterId: number, viewId: number) => {
    setCharViewLockMap((prev) => {
      const next = { ...prev };
      if (next[characterId] === viewId) {
        delete next[characterId]; // 再点一下就取消
      } else {
        next[characterId] = viewId;
      }
      return next;
    });
  };

  /** 锁定/切换/取消场景参考图 */
  const handleToggleEnvImage = (imageId: number) => {
    setLockedEnvImageId((prev) => (prev === imageId ? null : imageId));
  };

  const handleLockImage = async (imageId: number) => {
    if (!shot) return;
    try {
      await lockImage(shot.id, imageId);
      message.success('图片已锁定');
    } catch (error) {
      message.error((error as Error).message || '锁定图片失败');
    }
  };

  const handleLockVideo = async (videoId: number) => {
    if (!shot) return;
    try {
      await lockVideo(shot.id, videoId);
      message.success('视频已锁定');
    } catch (error) {
      message.error((error as Error).message || '锁定视频失败');
    }
  };

  if (!shot) return null;

  return (
    <Drawer
      title={shot.title || '镜头编辑'}
      open={open}
      onClose={onClose}
      width={480}
      styles={{
        header: { background: '#141414', borderBottom: '1px solid #1e1e1e' },
        body: { background: '#0c0c0c', padding: 16 },
      }}
      extra={
        <Button type="primary" icon={<SaveOutlined />} size="small" onClick={handleSave} loading={saving}>
          保存
        </Button>
      }
    >
      <Form form={form} layout="vertical">
        <Form.Item name="title" label="标题">
          <Input placeholder="镜头标题" />
        </Form.Item>

        <Form.Item name="narration" label="旁白">
          <TextArea rows={2} placeholder="旁白文案..." />
        </Form.Item>

        <Form.Item name="dialogue" label="对白">
          <TextArea rows={2} placeholder="角色对白..." />
        </Form.Item>

        <Form.Item name="subtitle" label="字幕">
          <Input placeholder="字幕内容" />
        </Form.Item>

        <Form.Item name="action_description" label="动作描述">
          <TextArea rows={2} placeholder="描述镜头中的动作..." />
        </Form.Item>

        <Form.Item name="camera_angle" label="镜头角度">
          <Select
            placeholder="请选择镜头角度"
            allowClear
            options={CAMERA_ANGLES.map((angle) => ({ value: angle.value, label: angle.label }))}
          />
        </Form.Item>

        <Form.Item name="character_ids" label="角色">
          <Select
            mode="multiple"
            placeholder="请选择角色"
            onChange={handleCharacterIdsChange}
            options={characters.map((char) => ({ value: char.id, label: char.name }))}
          />
        </Form.Item>
      </Form>

      <Divider style={{ borderColor: '#1e1e1e' }} />

      {/* 角色参考图：每个已选角色各自展示其 views，可锁定一张 */}
      <div style={{ marginBottom: 16 }}>
        <Text strong style={{ color: '#fff', display: 'block', marginBottom: 8 }}>
          角色参考图
          <Text type="secondary" style={{ fontSize: 11, marginLeft: 8, fontWeight: 400 }}>
            每个角色可锁定一张作为参考图，点击再次取消
          </Text>
        </Text>
        {selectedCharacterIds.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<Text type="secondary" style={{ fontSize: 12 }}>请先选择角色</Text>}
            style={{ margin: '8px 0' }}
          />
        ) : (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {selectedCharacterIds.map((charId) => {
              const char = charDetailMap[charId];
              const views: CharacterView[] = (char?.views ?? []).filter(
                (v) => v.status === 'completed' && !!v.image_url
              );
              const lockedViewId = charViewLockMap[charId];
              return (
                <div key={charId}>
                  <Text style={{ color: '#ccc', fontSize: 12, display: 'block', marginBottom: 6 }}>
                    {char?.name ?? `角色 #${charId}`}
                    {lockedViewId ? (
                      <Tag color="green" style={{ marginLeft: 8, fontSize: 10 }}>已锁定</Tag>
                    ) : null}
                  </Text>
                  {views.length === 0 ? (
                    <Text type="secondary" style={{ fontSize: 11 }}>该角色暂无可用视图</Text>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                      {views.map((view) => {
                        const isLocked = view.id === lockedViewId;
                        return (
                          <div
                            key={view.id}
                            onClick={() => handleToggleCharView(charId, view.id)}
                            style={{
                              position: 'relative',
                              borderRadius: 6,
                              overflow: 'hidden',
                              border: isLocked ? '2px solid #52c41a' : '2px solid #2a2a2a',
                              cursor: 'pointer',
                            }}
                          >
                            <Image
                              src={view.image_url ?? ''}
                              alt={view.view_type ?? 'view'}
                              preview={false}
                              style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover' }}
                            />
                            {isLocked && (
                              <div
                                style={{
                                  position: 'absolute',
                                  top: 2,
                                  right: 2,
                                  background: 'rgba(82, 196, 26, 0.9)',
                                  borderRadius: 4,
                                  padding: '1px 4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 2,
                                }}
                              >
                                <CheckCircleFilled style={{ fontSize: 10, color: '#fff' }} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </Space>
        )}
      </div>

      <Divider style={{ borderColor: '#1e1e1e' }} />

      {/* 场景参考图：当前分镜所属场景的 images，可锁定一张 */}
      <div style={{ marginBottom: 16 }}>
        <Text strong style={{ color: '#fff', display: 'block', marginBottom: 8 }}>
          场景参考图
          <Text type="secondary" style={{ fontSize: 11, marginLeft: 8, fontWeight: 400 }}>
            从本镜头所属场景的图片中锁定一张
          </Text>
        </Text>
        {!(currentScene?.environment_id || currentScene?.environment?.id) ? (
          <Text type="secondary" style={{ fontSize: 11 }}>当前场景未关联环境资产</Text>
        ) : sceneEnvImages.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<Text type="secondary" style={{ fontSize: 12 }}>该场景暂无可用图片</Text>}
            style={{ margin: '8px 0' }}
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {sceneEnvImages.map((img) => {
              const isLocked = img.id === lockedEnvImageId;
              return (
                <div
                  key={img.id}
                  onClick={() => handleToggleEnvImage(img.id)}
                  style={{
                    position: 'relative',
                    borderRadius: 6,
                    overflow: 'hidden',
                    border: isLocked ? '2px solid #52c41a' : '2px solid #2a2a2a',
                    cursor: 'pointer',
                  }}
                >
                  <Image
                    src={img.image_url}
                    alt={img.view_type ?? 'scene'}
                    preview={false}
                    style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover' }}
                  />
                  {isLocked && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 2,
                        right: 2,
                        background: 'rgba(82, 196, 26, 0.9)',
                        borderRadius: 4,
                        padding: '1px 4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                      }}
                    >
                      <CheckCircleFilled style={{ fontSize: 10, color: '#fff' }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Divider style={{ borderColor: '#1e1e1e' }} />

      {/* Image Selector */}
      <div style={{ marginBottom: 16 }}>
        <Text strong style={{ color: '#fff', display: 'block', marginBottom: 8 }}>
          候选图片（{shot.images.length}）
        </Text>
        <ImageSelector
          images={shot.images}
          lockedImageId={shot.locked_image_id}
          onLock={handleLockImage}
        />
      </div>

      <Divider style={{ borderColor: '#1e1e1e' }} />

      {/* Video Selector */}
      <div style={{ marginBottom: 16 }}>
        <Text strong style={{ color: '#fff', display: 'block', marginBottom: 8 }}>
          候选视频（{shot.videos?.length ?? 0}）
        </Text>
        <VideoSelector
          videos={shot.videos ?? []}
          lockedVideoId={shot.locked_video_id}
          onLock={handleLockVideo}
        />
      </div>

      <Divider style={{ borderColor: '#1e1e1e' }} />

      {/* Prompt Preview：图片提示词 + 视频提示词 两个 Collapse 面板，默认都展开 */}
      <Collapse
        defaultActiveKey={['image', 'video']}
        ghost
        items={[
          {
            key: 'image',
            label: (
              <Space>
                <EyeOutlined style={{ color: '#a855f7' }} />
                <Text strong style={{ color: '#fff' }}>图片提示词</Text>
                {imagePromptPreview?.is_custom && (
                  <Tag color="orange" style={{ fontSize: 10 }}>自定义中</Tag>
                )}
              </Space>
            ),
            children: renderPromptPanel({
              type: 'image',
              preview: imagePromptPreview,
              loading: loadingImagePrompt,
              modules: imageModules,
              customPrompt: customImagePrompt,
              onToggleModule: (key, value) => handleToggleModule('image', key, value),
              onCustomChange: setCustomImagePrompt,
              onRefresh: () => {
                handleResetCustomPrompt('image');
                fetchPrompt('image');
              },
            }),
          },
          {
            key: 'video',
            label: (
              <Space>
                <EyeOutlined style={{ color: '#22d3ee' }} />
                <Text strong style={{ color: '#fff' }}>视频提示词</Text>
                {videoPromptPreview?.is_custom && (
                  <Tag color="orange" style={{ fontSize: 10 }}>自定义中</Tag>
                )}
              </Space>
            ),
            children: renderPromptPanel({
              type: 'video',
              preview: videoPromptPreview,
              loading: loadingVideoPrompt,
              modules: videoModules,
              customPrompt: customVideoPrompt,
              onToggleModule: (key, value) => handleToggleModule('video', key, value),
              onCustomChange: setCustomVideoPrompt,
              onRefresh: () => {
                handleResetCustomPrompt('video');
                fetchPrompt('video');
              },
            }),
          },
        ]}
      />
    </Drawer>
  );
}

/** 单个提示词面板的渲染（图片/视频复用同一套结构） */
interface PromptPanelProps {
  type: PromptType;
  preview: PromptPreview | null;
  loading: boolean;
  modules: PromptModuleSwitches;
  customPrompt: string;
  onToggleModule: (key: PromptModuleKey, value: boolean) => void;
  onCustomChange: (value: string) => void;
  onRefresh: () => void;
}

function renderPromptPanel(props: PromptPanelProps) {
  const { preview, loading, modules, customPrompt, onToggleModule, onCustomChange, onRefresh } = props;
  const isCustom = !!customPrompt.trim();

  return (
    <div>
      {/* 6 个模块开关；自定义模式下整体禁用并降低透明度提示用户 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 6,
          marginBottom: 10,
          opacity: isCustom ? 0.4 : 1,
        }}
      >
        {PROMPT_MODULE_META.map((meta) => (
          <div
            key={meta.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 8px',
              background: '#141414',
              border: '1px solid #1e1e1e',
              borderRadius: 4,
            }}
          >
            <Text style={{ color: '#ccc', fontSize: 12 }}>{meta.label}</Text>
            <Switch
              size="small"
              checked={modules[meta.key]}
              disabled={isCustom}
              onChange={(value) => onToggleModule(meta.key, value)}
            />
          </div>
        ))}
      </div>

      {isCustom && (
        <Text type="warning" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>
          已使用自定义提示词，模块开关暂时失效。点击右侧"刷新"可清空自定义、回到开关拼接模式。
        </Text>
      )}

      {/* 自定义提示词文本框 */}
      <Input.TextArea
        value={customPrompt}
        onChange={(e) => onCustomChange(e.target.value)}
        placeholder={
          preview?.prompt
            ? `留空则使用模块拼接结果：\n${preview.prompt}`
            : '可留空使用上方开关拼接，或在此整段编辑覆盖'
        }
        autoSize={{ minRows: 3, maxRows: 8 }}
        style={{ background: '#0a0a0a', color: '#ccc', fontSize: 12, marginBottom: 8 }}
      />

      {/* 操作行：刷新按钮 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <Button
          type="link"
          size="small"
          icon={<ReloadOutlined />}
          loading={loading}
          onClick={onRefresh}
        >
          {isCustom ? '清空自定义并刷新' : '刷新预览'}
        </Button>
      </div>

      {/* 实际生效的 prompt 预览 + 各模块标签 */}
      {preview ? (
        <div style={{ background: '#141414', borderRadius: 6, padding: 12, border: '1px solid #1e1e1e' }}>
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>
            最终提示词预览（保存后生效）：
          </Text>
          <Paragraph style={{ color: '#ccc', fontSize: 12, marginBottom: 12, whiteSpace: 'pre-wrap' }}>
            {isCustom ? customPrompt : (preview.prompt || '（无内容）')}
          </Paragraph>
          {!isCustom && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {PROMPT_MODULE_META.map((meta) => {
                const value = preview.components[meta.key];
                if (!value || !modules[meta.key]) return null;
                return (
                  <Tag key={meta.key} color="purple" style={{ fontSize: 11 }}>
                    {meta.label}: {value.length > 30 ? `${value.slice(0, 30)}…` : value}
                  </Tag>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <Text type="secondary" style={{ fontSize: 12 }}>保存镜头信息后可查看生成提示词预览</Text>
      )}
    </div>
  );
}
