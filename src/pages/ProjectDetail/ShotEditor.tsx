import { useState, useEffect, useMemo, useRef } from 'react';
import { Drawer, Form, Input, Select, Button, Typography, Space, Divider, Tag, Empty, Image, Collapse, Switch, InputNumber, message } from 'antd';
import { SaveOutlined, EyeOutlined, CheckCircleFilled, ReloadOutlined, PictureOutlined, VideoCameraOutlined } from '@ant-design/icons';
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
import type { ImageGenParams, VideoGenParams } from '@/types/generation';
import { useProjectStore } from '@/stores/projectStore';
import { useAssetStore } from '@/stores/assetStore';
import { useGenerationStore } from '@/stores/generationStore';
import { CAMERA_ANGLES } from '@/utils/constants';
import * as shotApi from '@/api/shots';
import * as characterApi from '@/api/characters';
import * as environmentApi from '@/api/environments';
import ImageSelector from './ImageSelector';
import VideoSelector from './VideoSelector';

// 比例 / 分辨率 / 时长 选项常量：与 video_adapter._RESOLUTION_LONG_EDGE、image_adapter.resolve_image_size 保持一致
const RATIO_OPTIONS = [
  { value: '9:16', label: '9:16（竖屏）' },
  { value: '16:9', label: '16:9（横屏）' },
  { value: '1:1', label: '1:1（方形）' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
];
const IMAGE_RESOLUTION_OPTIONS = [
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
  { value: '2k', label: '2K' },
];
const VIDEO_RESOLUTION_OPTIONS = [
  { value: '480p', label: '480p' },
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
];

// 默认参数值（与后端 generation_tasks.py 的 DEFAULT_IMAGE_PARAMS / DEFAULT_VIDEO_PARAMS 保持一致）
const DEFAULT_IMAGE_PARAMS: ImageGenParams = { ratio: '9:16', resolution: '1080p' };
const DEFAULT_VIDEO_PARAMS: VideoGenParams = {
  ratio: '9:16',
  resolution: '1080p',
  duration: 5,
  watermark: false,
};

const { TextArea } = Input;
const { Text, Paragraph } = Typography;

interface ShotEditorProps {
  shot: Shot | null;
  projectId: number;
  open: boolean;
  onClose: () => void;
}

// 响应式断点：Drawer 内容区宽度小于此值时切换为单列布局
const COMPACT_BREAKPOINT = 720;

export default function ShotEditor({ shot, projectId, open, onClose }: ShotEditorProps) {
  // 检测 Drawer 内容区实际宽度，驱动响应式布局（而非窗口宽度）
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // 同时监听窗口宽度，用于决定 Drawer 自身的宽度
  const [windowWidth, setWindowWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1024,
  );
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  // isCompact: 基于 Drawer 内容区的实际宽度（非窗口宽度）
  const isCompact = containerWidth > 0 ? containerWidth < COMPACT_BREAKPOINT : windowWidth < COMPACT_BREAKPOINT;
  const isNarrowWindow = windowWidth <= 768;

  const { updateShot, currentProject, lockImage, lockVideo } = useProjectStore();
  const { characters, fetchCharacters } = useAssetStore();
  const {
    generateForShot,
    fetchImageModels,
    fetchVideoModels,
    imageModels,
    videoModels,
  } = useGenerationStore();
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

  // 生成参数（与默认值对齐）+ 选定的模型 id（不选则走后端默认）+ 提交瞬间 loading
  const [imageGenParams, setImageGenParams] = useState<ImageGenParams>(DEFAULT_IMAGE_PARAMS);
  const [videoGenParams, setVideoGenParams] = useState<VideoGenParams>(DEFAULT_VIDEO_PARAMS);
  const [imageModelId, setImageModelId] = useState<string | undefined>(undefined);
  const [videoModelId, setVideoModelId] = useState<string | undefined>(undefined);
  const [submittingImage, setSubmittingImage] = useState(false);
  const [submittingVideo, setSubmittingVideo] = useState(false);
  // 视频生成时选择的角色音频（角色 id → voice_config.audio_url）
  const [selectedAudioCharacterId, setSelectedAudioCharacterId] = useState<number | undefined>(undefined);

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
  // Form 表单关键字段的"瞬时值"。Form 内部状态变化不会触发 React rerender，
  // 这里 mirror 一份用于：
  //   1) 驱动"提示词预览自动同步"的 effect 依赖
  //   2) 自动同步落库时直接读取，避免依赖 form.getFieldsValue() 的不可序列化引用
  const [formSnapshot, setFormSnapshot] = useState<{
    title?: string;
    narration?: string;
    dialogue?: string;
    subtitle?: string;
    action_description?: string;
    camera_angle?: string;
  }>({});
  // 初始化首帧标记：open=true 后第一次拉到 shot 数据进行 setState 时，会把所有受控字段
  // 都"重新写一遍"（imageModules / customImagePrompt / charViewLockMap / formSnapshot 等），
  // 这些受控字段的变化会被自动同步 effect 误判为"用户改动"，导致一次空 PATCH。
  // 用 ref 标记初始化完成，避免误触发。
  const initializedRef = useRef(false);
  // 防抖句柄：每次依赖变化都重置一次 timer，避免短时间内频繁打接口
  const autoSyncTimerRef = useRef<number | null>(null);

  // 从 currentProject 反查当前 shot 所属 scene，再拿到 environment
  const currentScene = useMemo(() => {
    if (!shot || !currentProject) return null;
    return currentProject.scenes.find((scene) => scene.id === shot.scene_id) ?? null;
  }, [shot?.id, shot?.scene_id, currentProject]);

  useEffect(() => {
    if (shot && open) {
      // 切换到新 shot / 重新打开：先关掉自动同步开关，等 setState 全部完成
      // 后再打开，避免初始化的 setState 被自动同步 effect 误判为"用户改动"
      initializedRef.current = false;

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
      // 同步 form 关键字段到 snapshot，让自动同步 effect 能感知
      setFormSnapshot({
        title: shot.title ?? undefined,
        narration: shot.narration ?? undefined,
        dialogue: shot.dialogue ?? undefined,
        subtitle: shot.subtitle ?? undefined,
        action_description: shot.action_description ?? undefined,
        camera_angle: shot.camera_angle ?? undefined,
      });

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

      // 拉每个已选角色的详情（含 views），**必须等全部完成后**才开启自动同步开关。
      // 否则 charViewLockMap 还是 {} 时自动同步 effect 就触发，会把
      // ref_character_view_ids=[] 写进数据库，覆盖掉原来的参考图。
      const charDetailPromises = initialCharIds.map((charId) =>
        loadCharacterDetail(charId, refViewIds),
      );

      // 同时拉图片 + 视频两份提示词预览
      fetchPrompt('image');
      fetchPrompt('video');

      // 拉模型清单（store 自带缓存，重复 open 也只会走一次网络）
      fetchImageModels().catch(() => undefined);
      fetchVideoModels().catch(() => undefined);

      // 等所有角色详情拉取完成（charViewLockMap 已被正确填充）后，
      // 再开启自动同步开关，避免初始化阶段的空 charViewLockMap 覆盖数据库。
      let cancelled = false;
      Promise.all(charDetailPromises).finally(() => {
        if (!cancelled) {
          initializedRef.current = true;
        }
      });
      return () => { cancelled = true; };
    } else if (!open) {
      // 关闭抽屉时立即关掉开关，避免后续残余状态变化触发同步
      initializedRef.current = false;
      // 清掉防抖句柄，避免延迟 PATCH 在抽屉关闭后才触发
      if (autoSyncTimerRef.current) {
        window.clearTimeout(autoSyncTimerRef.current);
        autoSyncTimerRef.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot?.id, open]);

  /**
   * "提示词预览实时同步"自动同步 effect：
   * 监听文本编辑区 / 模块开关 / 自定义提示词 / 角色参考图锁定 / 场景参考图锁定，
   * 防抖 350ms 后只更新预览相关字段，并立即重拉两份 prompt 预览。
   *
   * 设计要点：
   * - 用 initializedRef 跳过 open 时的初始化首帧，避免空 PATCH
   * - 不在 effect 里读 form.getFieldsValue（不会触发 rerender），用 formSnapshot 代替
   * - 这里调用的 updateShot 是幂等的局部更新，包含角色关联（character_ids）
   *   以实现选中角色后自动保存，无需手动点击保存按钮
   */
  useEffect(() => {
    if (!shot || !open || !initializedRef.current) return;

    if (autoSyncTimerRef.current) {
      window.clearTimeout(autoSyncTimerRef.current);
    }
    autoSyncTimerRef.current = window.setTimeout(async () => {
      autoSyncTimerRef.current = null;
      try {
        const refCharacterViewIds = selectedCharacterIds
          .map((charId) => charViewLockMap[charId])
          .filter((vid): vid is number => typeof vid === 'number');
        await updateShot(shot.id, {
          ...formSnapshot,
          character_ids: selectedCharacterIds,
          ref_character_view_ids: refCharacterViewIds,
          ref_environment_image_id: lockedEnvImageId,
          prompt_modules_image: imageModules,
          prompt_modules_video: videoModules,
          custom_prompt_image: customImagePrompt,
          custom_prompt_video: customVideoPrompt,
        });
        // 落库成功后重拉两份预览，让"最终提示词"区域显示与服务器一致
        fetchPrompt('image');
        fetchPrompt('video');
      } catch {
        // 自动同步失败不打扰用户（保留显式"保存"按钮作为兜底）
        // 但如果用户看到预览没更新，可以点保存按钮强制走一遍 + 提示
      }
    }, 350);

    return () => {
      if (autoSyncTimerRef.current) {
        window.clearTimeout(autoSyncTimerRef.current);
        autoSyncTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    shot?.id,
    open,
    formSnapshot,
    selectedCharacterIds,
    charViewLockMap,
    lockedEnvImageId,
    imageModules,
    videoModules,
    customImagePrompt,
    customVideoPrompt,
  ]);

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
        const available = (env.images ?? []).filter(
          (img) => img.status === 'completed' && !!img.image_url
        );
        setSceneEnvImages(available);
        // 若数据库没有保存过场景参考图，默认选中第一张
        setLockedEnvImageId((prev) => (prev == null && available.length > 0 ? available[0].id : prev));
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
      // 从已保存的 refViewIds 中挑出属于这个角色的那一张（若有），落到 charViewLockMap；
      // 若数据库没保存过参考图（refViewIds 中无匹配），则默认选中该角色的第一张可用 view
      const availableViews = (char.views ?? []).filter(
        (v) => v.status === 'completed' && !!v.image_url
      );
      const matchedView = availableViews.find((v) => refViewIds.includes(v.id));
      const defaultView = matchedView ?? availableViews[0];
      if (defaultView) {
        setCharViewLockMap((prev) => ({ ...prev, [characterId]: defaultView.id }));
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
    // 拉未加载过详情的新角色；对已缓存角色补充默认选中
    value.forEach((charId) => {
      if (!charDetailMap[charId]) {
        loadCharacterDetail(charId, []);
      } else {
        // 已缓存但可能刚被清理掉锁定记录，需补充默认选中第一张可用 view
        setCharViewLockMap((prev) => {
          if (prev[charId] !== undefined) return prev;
          const cached = charDetailMap[charId];
          const availableViews = (cached.views ?? []).filter(
            (v: any) => v.status === 'completed' && !!v.image_url
          );
          if (availableViews.length > 0) {
            return { ...prev, [charId]: availableViews[0].id };
          }
          return prev;
        });
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

  /** 在 ShotEditor 内一键发起生成（带当前用户选择的 ratio/resolution/duration/watermark）。
   *  设计约束：
   *  - 任何时候都要禁止重复点击：用 submittingImage / submittingVideo 控制
   *  - 视频任务前置条件：shot.locked_image_id 不为空，否则后端必然失败，前端提前拦截
   *  - 模型 id 不选时透传 undefined，由后端用默认模型
   */
  const handleGenerateImage = async () => {
    if (!shot || submittingImage) return;
    setSubmittingImage(true);
    try {
      await generateForShot(projectId, shot.id, 'image', imageModelId, imageGenParams);
      message.success('图片生成已提交');
    } catch (error) {
      message.error((error as Error).message || '图片生成失败');
    } finally {
      setSubmittingImage(false);
    }
  };

  const handleGenerateVideo = async () => {
    if (!shot || submittingVideo) return;
    if (!shot.locked_image_id) {
      message.warning('请先锁定一张候选图作为视频首帧');
      return;
    }
    setSubmittingVideo(true);
    try {
      // 如果选择了角色音频，把 audio_url 注入到视频生成参数中
      const finalVideoParams = { ...videoGenParams };
      if (selectedAudioCharacterId) {
        const selectedChar = charDetailMap[selectedAudioCharacterId];
        const audioUrl = selectedChar?.voice_config?.audio_url;
        console.log('[ShotEditor] audio debug:', {
          selectedAudioCharacterId,
          charFound: !!selectedChar,
          voiceConfig: selectedChar?.voice_config,
          audioUrl,
        });
        if (audioUrl) {
          finalVideoParams.audio_url = audioUrl;
        }
      }
      console.log('[ShotEditor] finalVideoParams:', JSON.stringify(finalVideoParams));
      await generateForShot(projectId, shot.id, 'video', videoModelId, finalVideoParams);
      message.success('视频生成已提交');
    } catch (error) {
      message.error((error as Error).message || '视频生成失败');
    } finally {
      setSubmittingVideo(false);
    }
  };

  if (!shot) return null;

  // 每个象限的通用样式：独立背景 + 边框 + 内边距，便于视觉区分
  const quadrantStyle: React.CSSProperties = {
    background: '#141414',
    border: '1px solid #1e1e1e',
    borderRadius: 8,
    padding: isCompact ? 10 : 12,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'auto',
  };

  // Drawer 宽度策略：窄窗口全屏，宽窗口给更多空间（70vw 保证内容区 > 720px）
  const drawerWidth = isNarrowWindow ? '100vw' : '70vw';

  return (
    <Drawer
      title={shot.title || '镜头编辑'}
      open={open}
      onClose={onClose}
      width={drawerWidth}
      styles={{
        header: { background: '#141414', borderBottom: '1px solid #1e1e1e' },
        body: { background: '#0c0c0c', padding: isCompact ? 8 : 12 },
      }}
      extra={
        <Button type="primary" icon={<SaveOutlined />} size="small" onClick={handleSave} loading={saving}>
          保存
        </Button>
      }
    >
      {/* 响应式布局：基于容器实际宽度决定单列/双列 */}
      <div
        ref={containerRef}
        style={{
          display: 'grid',
          gridTemplateColumns: isCompact ? '1fr' : '1fr 1fr',
          gridTemplateRows: isCompact ? 'auto' : 'minmax(320px, auto) minmax(420px, auto)',
          gap: isCompact ? 8 : 12,
        }}
      >
        {/* ─────────── 左上：文本编辑区 ─────────── */}
        <div style={quadrantStyle}>
          <Text strong style={{ color: '#fff', display: 'block', marginBottom: 8 }}>
            文本编辑
          </Text>
          <Form
            form={form}
            layout="vertical"
            size="small"
            // 任意字段变化都同步到 formSnapshot，驱动"提示词预览"自动同步 effect。
            // antd Form 的内部 store 不会触发 React rerender，必须显式 mirror 一份。
            onValuesChange={(_changed, all) => {
              setFormSnapshot({
                title: all.title,
                narration: all.narration,
                dialogue: all.dialogue,
                subtitle: all.subtitle,
                action_description: all.action_description,
                camera_angle: all.camera_angle,
              });
            }}
          >
            <Form.Item name="title" label="标题" style={{ marginBottom: 8 }}>
              <Input placeholder="镜头标题" />
            </Form.Item>
            <Form.Item name="narration" label="旁白" style={{ marginBottom: 8 }}>
              <TextArea rows={2} placeholder="旁白文案..." />
            </Form.Item>
            <Form.Item name="dialogue" label="对白" style={{ marginBottom: 8 }}>
              <TextArea rows={2} placeholder="角色对白..." />
            </Form.Item>
            <Form.Item name="subtitle" label="字幕" style={{ marginBottom: 8 }}>
              <Input placeholder="字幕内容" />
            </Form.Item>
            <Form.Item name="action_description" label="动作描述" style={{ marginBottom: 8 }}>
              <TextArea rows={2} placeholder="描述镜头中的动作..." />
            </Form.Item>
            <Form.Item name="camera_angle" label="镜头角度" style={{ marginBottom: 8 }}>
              <Select
                placeholder="请选择镜头角度"
                allowClear
                options={CAMERA_ANGLES.map((angle) => ({ value: angle.value, label: angle.label }))}
              />
            </Form.Item>
          </Form>
        </div>

        {/* ─────────── 右上：角色 + 场景参考区 ─────────── */}
        <div style={quadrantStyle}>
          <Text strong style={{ color: '#fff', display: 'block', marginBottom: 8 }}>
            角色 / 场景参考
          </Text>

          {/* 角色选择 */}
          <div style={{ marginBottom: 12 }}>
            <Text style={{ color: '#ccc', fontSize: 12, display: 'block', marginBottom: 6 }}>
              选择角色
            </Text>
            <Select
              mode="multiple"
              placeholder="请选择角色"
              value={selectedCharacterIds}
              onChange={handleCharacterIdsChange}
              options={characters.map((char) => ({ value: char.id, label: char.name }))}
              style={{ width: '100%' }}
              size="small"
            />
          </div>

          {/* 角色参考图：每个已选角色各自展示其 views，可锁定一张 */}
          <div style={{ marginBottom: 12 }}>
            <Text style={{ color: '#ccc', fontSize: 12, display: 'block', marginBottom: 6 }}>
              角色参考图
              <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
                每个角色可锁定一张，再次点击取消
              </Text>
            </Text>
            {selectedCharacterIds.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={<Text type="secondary" style={{ fontSize: 12 }}>请先选择角色</Text>}
                style={{ margin: '4px 0' }}
              />
            ) : (
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {selectedCharacterIds.map((charId) => {
                  const char = charDetailMap[charId];
                  const views: CharacterView[] = (char?.views ?? []).filter(
                    (v) => v.status === 'completed' && !!v.image_url
                  );
                  const lockedViewId = charViewLockMap[charId];
                  return (
                    <div key={charId}>
                      <Text style={{ color: '#aaa', fontSize: 12, display: 'block', marginBottom: 4 }}>
                        {char?.name ?? `角色 #${charId}`}
                        {lockedViewId ? (
                          <Tag color="green" style={{ marginLeft: 6, fontSize: 10 }}>已锁定</Tag>
                        ) : null}
                      </Text>
                      {views.length === 0 ? (
                        <Text type="secondary" style={{ fontSize: 11 }}>该角色暂无可用视图</Text>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: isCompact ? 'repeat(3, 1fr)' : 'repeat(4, 1fr)', gap: 6 }}>
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

          <Divider style={{ borderColor: '#1e1e1e', margin: '8px 0' }} />

          {/* 场景参考图：当前分镜所属场景的 images，可锁定一张 */}
          <div>
            <Text style={{ color: '#ccc', fontSize: 12, display: 'block', marginBottom: 6 }}>
              场景参考图
              <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
                从本镜头所属场景的图片中锁定一张
              </Text>
            </Text>
            {!(currentScene?.environment_id || currentScene?.environment?.id) ? (
              <Text type="secondary" style={{ fontSize: 11 }}>当前场景未关联环境资产</Text>
            ) : sceneEnvImages.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={<Text type="secondary" style={{ fontSize: 12 }}>该场景暂无可用图片</Text>}
                style={{ margin: '4px 0' }}
              />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: isCompact ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 6 }}>
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
        </div>

        {/* ─────────── 左下：图片提示词 + 候选图 + 生成按钮 ─────────── */}
        <div style={quadrantStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <PictureOutlined style={{ color: '#a855f7' }} />
            <Text strong style={{ color: '#fff' }}>图片生成</Text>
            {imagePromptPreview?.is_custom && (
              <Tag color="orange" style={{ fontSize: 10 }}>自定义中</Tag>
            )}
          </div>

          {/* 提示词面板 */}
          {renderPromptPanel({
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
          })}

          <Divider style={{ borderColor: '#1e1e1e', margin: '10px 0' }} />

          {/* 参数控制：比例、分辨率、模型 + 生成按钮 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              marginBottom: 10,
            }}
          >
            <div>
              <Text style={{ color: '#aaa', fontSize: 11, display: 'block', marginBottom: 4 }}>比例</Text>
              <Select
                size="small"
                style={{ width: '100%' }}
                value={imageGenParams.ratio}
                onChange={(value) => setImageGenParams((prev) => ({ ...prev, ratio: value }))}
                options={RATIO_OPTIONS}
              />
            </div>
            <div>
              <Text style={{ color: '#aaa', fontSize: 11, display: 'block', marginBottom: 4 }}>分辨率</Text>
              <Select
                size="small"
                style={{ width: '100%' }}
                value={imageGenParams.resolution}
                onChange={(value) => setImageGenParams((prev) => ({ ...prev, resolution: value }))}
                options={IMAGE_RESOLUTION_OPTIONS}
              />
            </div>
            <div style={{ gridColumn: '1 / 3' }}>
              <Text style={{ color: '#aaa', fontSize: 11, display: 'block', marginBottom: 4 }}>模型（不选用默认）</Text>
              <Select
                size="small"
                style={{ width: '100%' }}
                allowClear
                placeholder="使用默认图像模型"
                value={imageModelId}
                onChange={(value) => setImageModelId(value)}
                options={imageModels.map((m) => ({
                  value: m.id,
                  label: m.is_default ? `${m.display_name ?? m.label ?? m.id}（默认）` : (m.display_name ?? m.label ?? m.id),
                }))}
              />
            </div>
          </div>
          <Button
            type="primary"
            block
            icon={<PictureOutlined />}
            loading={submittingImage}
            onClick={handleGenerateImage}
            style={{ marginBottom: 12 }}
          >
            生成图片
          </Button>

          {/* 候选图展示 */}
          <Text style={{ color: '#aaa', fontSize: 12, display: 'block', marginBottom: 6 }}>
            候选图片（{shot.images.length}）
          </Text>
          <ImageSelector
            images={shot.images}
            lockedImageId={shot.locked_image_id}
            onLock={handleLockImage}
          />
        </div>

        {/* ─────────── 右下：视频提示词 + 候选视频 + 生成按钮 ─────────── */}
        <div style={quadrantStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <VideoCameraOutlined style={{ color: '#22d3ee' }} />
            <Text strong style={{ color: '#fff' }}>视频生成</Text>
            {videoPromptPreview?.is_custom && (
              <Tag color="orange" style={{ fontSize: 10 }}>自定义中</Tag>
            )}
          </div>

          {/* 提示词面板 */}
          {renderPromptPanel({
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
          })}

          <Divider style={{ borderColor: '#1e1e1e', margin: '10px 0' }} />

          {/* 参数控制：比例、分辨率、时长、水印、模型 + 生成按钮 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              marginBottom: 10,
            }}
          >
            <div>
              <Text style={{ color: '#aaa', fontSize: 11, display: 'block', marginBottom: 4 }}>比例</Text>
              <Select
                size="small"
                style={{ width: '100%' }}
                value={videoGenParams.ratio}
                onChange={(value) => setVideoGenParams((prev) => ({ ...prev, ratio: value }))}
                options={RATIO_OPTIONS}
              />
            </div>
            <div>
              <Text style={{ color: '#aaa', fontSize: 11, display: 'block', marginBottom: 4 }}>分辨率</Text>
              <Select
                size="small"
                style={{ width: '100%' }}
                value={videoGenParams.resolution}
                onChange={(value) => setVideoGenParams((prev) => ({ ...prev, resolution: value }))}
                options={VIDEO_RESOLUTION_OPTIONS}
              />
            </div>
            <div>
              <Text style={{ color: '#aaa', fontSize: 11, display: 'block', marginBottom: 4 }}>时长（秒）</Text>
              <InputNumber
                size="small"
                min={3}
                max={15}
                step={1}
                style={{ width: '100%' }}
                value={videoGenParams.duration}
                onChange={(value) =>
                  setVideoGenParams((prev) => ({
                    ...prev,
                    duration: typeof value === 'number' ? value : 5,
                  }))
                }
              />
            </div>
            <div>
              <Text style={{ color: '#aaa', fontSize: 11, display: 'block', marginBottom: 4 }}>水印</Text>
              <div
                style={{
                  height: 24,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Switch
                  size="small"
                  checked={!!videoGenParams.watermark}
                  onChange={(value) => setVideoGenParams((prev) => ({ ...prev, watermark: value }))}
                />
                <Text style={{ color: '#888', fontSize: 11, marginLeft: 8 }}>
                  {videoGenParams.watermark ? '带水印' : '无水印'}
                </Text>
              </div>
            </div>
            <div style={{ gridColumn: '1 / 3' }}>
              <Text style={{ color: '#aaa', fontSize: 11, display: 'block', marginBottom: 4 }}>模型（不选用默认）</Text>
              <Select
                size="small"
                style={{ width: '100%' }}
                allowClear
                placeholder="使用默认视频模型"
                value={videoModelId}
                onChange={(value) => {
                  setVideoModelId(value);
                  // 切换模型时，若新模型不支持音频则清空已选的角色音频
                  const newModel = videoModels.find((m) => m.id === value);
                  if (!newModel?.supports_audio) {
                    setSelectedAudioCharacterId(undefined);
                  }
                }}
                options={videoModels.map((m) => ({
                  value: m.id,
                  label: m.is_default ? `${m.display_name ?? m.label ?? m.id}（默认）` : (m.display_name ?? m.label ?? m.id),
                }))}
              />
            </div>
            {/* 角色音频选择：只要有任何模型支持音频就显示此区域 */}
            {(() => {
              const anyModelSupportsAudio = videoModels.some((m) => m.supports_audio);
              if (!anyModelSupportsAudio) return null;

              const currentVideoModel = videoModels.find((m) => m.id === videoModelId)
                ?? videoModels.find((m) => m.is_default);
              const currentModelSupportsAudio = !!currentVideoModel?.supports_audio;
              // 找到支持音频的模型名称，用于提示
              const audioModelNames = videoModels
                .filter((m) => m.supports_audio)
                .map((m) => m.display_name ?? m.label ?? m.id);

              // 筛选出当前镜头关联的、且有声音档案的角色
              const audioCharacters = selectedCharacterIds
                .map((charId) => charDetailMap[charId])
                .filter((char): char is Character => !!char?.voice_config?.audio_url);

              return (
                <div style={{ gridColumn: '1 / 3' }}>
                  <Text style={{ color: '#aaa', fontSize: 11, display: 'block', marginBottom: 4 }}>角色音频（驱动音频）</Text>
                  {!currentModelSupportsAudio ? (
                    <Text style={{ color: '#666', fontSize: 11 }}>
                      当前模型不支持音频，请切换到 {audioModelNames.join(' / ')}
                    </Text>
                  ) : audioCharacters.length > 0 ? (
                    <Select
                      size="small"
                      style={{ width: '100%' }}
                      allowClear
                      placeholder="不使用角色音频"
                      value={selectedAudioCharacterId}
                      onChange={(value) => setSelectedAudioCharacterId(value)}
                      options={audioCharacters.map((char) => ({
                        value: char.id,
                        label: `${char.name}${char.voice_config?.audio_name ? ` (${char.voice_config.audio_name})` : ''}`,
                      }))}
                    />
                  ) : (
                    <Text style={{ color: '#666', fontSize: 11 }}>
                      {selectedCharacterIds.length === 0
                        ? '请先在左侧关联角色'
                        : '关联的角色暂无声音档案'}
                    </Text>
                  )}
                </div>
              );
            })()}
          </div>
          <Button
            type="primary"
            block
            icon={<VideoCameraOutlined />}
            loading={submittingVideo}
            disabled={!shot.locked_image_id}
            onClick={handleGenerateVideo}
            style={{ marginBottom: 12 }}
          >
            {shot.locked_image_id ? '生成视频' : '请先锁定一张候选图'}
          </Button>

          {/* 候选视频展示 */}
          <Text style={{ color: '#aaa', fontSize: 12, display: 'block', marginBottom: 6 }}>
            候选视频（{shot.videos?.length ?? 0}）
          </Text>
          <VideoSelector
            videos={shot.videos ?? []}
            lockedVideoId={shot.locked_video_id}
            onLock={handleLockVideo}
          />
        </div>
      </div>
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

      {/* 操作行：手动刷新（兜底，正常情况下变更会自动同步） */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Text type="secondary" style={{ fontSize: 11 }}>
          预览实时同步
        </Text>
        <Button
          type="link"
          size="small"
          icon={<ReloadOutlined />}
          loading={loading}
          onClick={onRefresh}
        >
          {isCustom ? '清空自定义' : '手动刷新'}
        </Button>
      </div>

      {/* 实际生效的 prompt 预览 + 各模块标签 */}
      {preview ? (
        <div style={{ background: '#141414', borderRadius: 6, padding: 12, border: '1px solid #1e1e1e' }}>
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>
            最终提示词预览：
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
        <Text type="secondary" style={{ fontSize: 12 }}>编辑镜头信息后将自动展示提示词预览</Text>
      )}
    </div>
  );
}
