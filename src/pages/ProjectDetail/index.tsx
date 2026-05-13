import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Spin, Button, Space, Dropdown, message, Typography } from 'antd';
import type { MenuProps } from 'antd';
import {
  ArrowLeftOutlined,
  DownloadOutlined,
  ThunderboltOutlined,
  PictureOutlined,
  VideoCameraOutlined,
  EditOutlined,
  DownOutlined,
} from '@ant-design/icons';
import { useLocale } from '@/hooks/useLocale';
import { useProjectStore } from '@/stores/projectStore';
import { useGenerationStore } from '@/stores/generationStore';
import { getModelDisplayName } from '@/types/imageModel';
import { exportProjectJson, exportProjectZip } from '@/api/export';
import ScriptPanel from './ScriptPanel';
import Canvas from './Canvas';
import PreviewPlayer from './PreviewPlayer';
import ShotEditor from './ShotEditor';
import type { Shot } from '@/types/shot';
import type { Scene } from '@/types/scene';

const { Text } = Typography;

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const projectId = Number(id);
  const { currentProject, loading, fetchProject, clearProject } = useProjectStore();
  const { generateAll, fetchImageModels, fetchVideoModels } = useGenerationStore();
  const imageModels = useGenerationStore((state) => state.imageModels);
  const videoModels = useGenerationStore((state) => state.videoModels);
  const { t } = useLocale();
  // 只存 shot.id，真正的 shot 对象每次渲染从 currentProject 派生（见下方 selectedShot useMemo）。
  // 这样视频/图片生成完成后 fetchProject 刷新 currentProject，ShotEditor 收到的 shot 会自动带上最新 videos/images，
  // 不需要用户手动刷新浏览器。
  const [selectedShotId, setSelectedShotId] = useState<number | null>(null);
  const [selectedScene, setSelectedScene] = useState<Scene | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  // 剧本面板默认隐藏，需要时点击按钮展开
  const [scriptCollapsed, setScriptCollapsed] = useState(true);
  const [previewCollapsed, setPreviewCollapsed] = useState(true);

  useEffect(() => {
    if (projectId) {
      fetchProject(projectId);
    }
    // 预取图像/视频模型清单：批量生成按钮展开下拉时无需再等网络
    fetchImageModels().catch(() => {
      /* silent */
    });
    fetchVideoModels().catch(() => {
      /* silent */
    });
    return () => {
      clearProject();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleShotClick = useCallback((shot: Shot) => {
    setSelectedShotId(shot.id);
    setEditorOpen(true);
  }, []);

  // 从 currentProject 派生最新的 selectedShot，确保任何 store 更新（生成完成、保存、锁定）都即时反映到编辑器
  const selectedShot = useMemo<Shot | null>(() => {
    if (selectedShotId == null || !currentProject) return null;
    for (const scene of currentProject.scenes) {
      const found = scene.shots.find((s) => s.id === selectedShotId);
      if (found) return found;
    }
    return null;
  }, [selectedShotId, currentProject]);

  const handleSceneClick = useCallback((scene: Scene) => {
    setSelectedScene(scene);
  }, []);

  const handleBatchGenerate = async (
    taskType: 'image' | 'video',
    modelId?: string,
  ) => {
    if (!currentProject) return;

    if (taskType === 'video') {
      const unlockedShots = currentProject.scenes
        .flatMap((scene) => scene.shots)
        .filter((shot) => !shot.locked_image_id);
      if (unlockedShots.length > 0) {
        message.warning(t('projectDetail.noLockedImage', { count: unlockedShots.length }));
        return;
      }
    }

    try {
      await generateAll(projectId, taskType, modelId);
      message.success(t('projectDetail.batchStarted', { type: taskType }));
    } catch (error) {
      message.error((error as Error).message || t('projectDetail.batchFailed'));
    }
  };

  // 批量生成图片时的模型下拉菜单
  const batchImageModelMenu: MenuProps = useMemo(
    () => ({
      items:
        imageModels.length === 0
          ? [
              {
                key: 'empty',
                label: t('shotCard.noImageModels'),
                disabled: true,
              },
            ]
          : imageModels.map((model) => ({
              key: model.id,
              label: (
                <span>
                  {getModelDisplayName(model)}
                  {model.is_default && (
                    <Text style={{ marginLeft: 6, fontSize: 11, color: '#a855f7' }}>
                      · {t('settings.defaultModelTag')}
                    </Text>
                  )}
                </span>
              ),
            })),
      onClick: ({ key }) => {
        if (key === 'empty') return;
        void handleBatchGenerate('image', key);
      },
    }),
    // handleBatchGenerate 闭包引用 currentProject/projectId/generateAll，但它们在重渲染时稳定
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [imageModels, t],
  );

  // 批量生成视频时的模型下拉菜单（与图片菜单同构）
  const batchVideoModelMenu: MenuProps = useMemo(
    () => ({
      items:
        videoModels.length === 0
          ? [
              {
                key: 'empty',
                label: t('shotCard.noVideoModels'),
                disabled: true,
              },
            ]
          : videoModels.map((model) => ({
              key: model.id,
              label: (
                <span>
                  {getModelDisplayName(model)}
                  {model.is_default && (
                    <Text style={{ marginLeft: 6, fontSize: 11, color: '#a855f7' }}>
                      · {t('settings.defaultModelTag')}
                    </Text>
                  )}
                </span>
              ),
            })),
      onClick: ({ key }) => {
        if (key === 'empty') return;
        void handleBatchGenerate('video', key);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [videoModels, t],
  );

  const triggerBrowserDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const handleExportJson = async () => {
    try {
      const data = await exportProjectJson(projectId);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      triggerBrowserDownload(blob, `project_${projectId}.json`);
      message.success(t('projectDetail.exportStarted'));
    } catch (error) {
      message.error((error as Error).message || t('projectDetail.exportFailed'));
    }
  };

  const handleExportZip = async () => {
    try {
      const blob = await exportProjectZip(projectId);
      triggerBrowserDownload(blob, `project_${projectId}.zip`);
      message.success(t('projectDetail.exportStarted'));
    } catch (error) {
      message.error((error as Error).message || t('projectDetail.exportFailed'));
    }
  };

  if (loading && !currentProject) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!currentProject) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Text type="secondary">{t('projectDetail.notFound')}</Text>
        <br />
        <Button type="link" onClick={() => navigate('/projects')}>
          {t('projectDetail.backToProjects')}
        </Button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', margin: -24 }}>
      {/* Project Title Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          borderBottom: '1px solid #1e1e1e',
          background: '#0c0c0c',
        }}
      >
        <Space>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/projects')} />
          <Text strong style={{ color: '#fff', fontSize: 16 }}>
            {currentProject.name}
          </Text>
          {currentProject.style && (
            <Text style={{ fontSize: 12, color: '#a855f7' }}>{currentProject.style.name}</Text>
          )}
        </Space>
        {/* 剧本编辑按钮（默认隐藏，点击展开侧边） */}
        <Button
          type={scriptCollapsed ? 'default' : 'primary'}
          size="small"
          icon={<EditOutlined />}
          onClick={() => setScriptCollapsed(!scriptCollapsed)}
        >
          {scriptCollapsed ? t('projectDetail.scriptToggle') : t('projectDetail.scriptToggleCollapse')}
        </Button>
      </div>

      {/* Main Content: Three-Column Layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {/* Left: Script Panel - 默认隐藏，点击顶部"剧本"按钮后展开 */}
        {!scriptCollapsed && (
          <div style={{ width: 340, flexShrink: 0 }}>
            <ScriptPanel projectId={projectId} />
          </div>
        )}

        {/* Center: Canvas */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <Canvas
            projectId={projectId}
            onShotClick={handleShotClick}
            onSceneClick={handleSceneClick}
            selectedSceneId={selectedScene?.id ?? null}
          />
        </div>

        {/* Right: Preview Player - 显示视频预览或选中场景的信息 */}
        {!previewCollapsed && (
          <div style={{ width: 320, flexShrink: 0 }}>
            <PreviewPlayer
              selectedScene={selectedScene}
              onCloseScene={() => setSelectedScene(null)}
            />
          </div>
        )}
        <Button
          type="text"
          size="small"
          onClick={() => setPreviewCollapsed(!previewCollapsed)}
          style={{
            position: 'absolute',
            right: previewCollapsed ? 0 : 280,
            top: '50%',
            zIndex: 10,
            background: '#1e1e1e',
            borderRadius: '4px 0 0 4px',
            color: '#888',
            height: 40,
            width: 16,
            padding: 0,
            fontSize: 10,
          }}
        >
          {previewCollapsed ? '◀' : '▶'}
        </Button>
      </div>

      {/* Bottom Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          borderTop: '1px solid #1e1e1e',
          background: '#141414',
        }}
      >
        <Space>
          {/* 批量生成图片：主按钮走默认模型；右侧箭头展开模型下拉 */}
          <Dropdown.Button
            type="primary"
            icon={<DownOutlined />}
            menu={batchImageModelMenu}
            onClick={() => handleBatchGenerate('image')}
          >
            <PictureOutlined /> {t('projectDetail.generateAllImages')}
          </Dropdown.Button>
          {/* 批量生成视频：与图片同构，主按钮走默认模型，右侧箭头展开模型下拉 */}
          <Dropdown.Button
            icon={<DownOutlined />}
            menu={batchVideoModelMenu}
            onClick={() => handleBatchGenerate('video')}
          >
            <VideoCameraOutlined /> {t('projectDetail.generateAllVideos')}
          </Dropdown.Button>
        </Space>
        <Space>
          <ThunderboltOutlined style={{ color: '#faad14' }} />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('projectDetail.shotsCount', { count: currentProject.scenes.reduce((sum, scene) => sum + scene.shots.length, 0) })}
          </Text>
          <Button icon={<DownloadOutlined />} onClick={handleExportJson}>
            {t('projectDetail.exportJson')}
          </Button>
          <Button icon={<DownloadOutlined />} onClick={handleExportZip}>
            {t('projectDetail.exportZip')}
          </Button>
        </Space>
      </div>

      {/* Shot Editor Drawer */}
      <ShotEditor
        shot={selectedShot}
        projectId={projectId}
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setSelectedShotId(null);
        }}
      />
    </div>
  );
}
