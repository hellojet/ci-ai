import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Spin, Button, Space, message, Typography } from 'antd';
import {
  ArrowLeftOutlined,
  DownloadOutlined,
  ThunderboltOutlined,
  PictureOutlined,
  VideoCameraOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { useLocale } from '@/hooks/useLocale';
import { useProjectStore } from '@/stores/projectStore';
import { useGenerationStore } from '@/stores/generationStore';
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
  const { generateAll } = useGenerationStore();
  const { t } = useLocale();
  const [selectedShot, setSelectedShot] = useState<Shot | null>(null);
  const [selectedScene, setSelectedScene] = useState<Scene | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  // 剧本面板默认隐藏，需要时点击按钮展开
  const [scriptCollapsed, setScriptCollapsed] = useState(true);
  const [previewCollapsed, setPreviewCollapsed] = useState(false);

  useEffect(() => {
    if (projectId) {
      fetchProject(projectId);
    }
    return () => {
      clearProject();
    };
  }, [projectId]);

  const handleShotClick = useCallback((shot: Shot) => {
    setSelectedShot(shot);
    setEditorOpen(true);
  }, []);

  const handleSceneClick = useCallback((scene: Scene) => {
    setSelectedScene(scene);
  }, []);

  const handleBatchGenerate = async (taskType: 'image' | 'video') => {
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
      await generateAll(projectId, taskType);
      message.success(t('projectDetail.batchStarted', { type: taskType }));
    } catch (error) {
      message.error((error as Error).message || t('projectDetail.batchFailed'));
    }
  };

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
          <Button
            type="primary"
            icon={<PictureOutlined />}
            onClick={() => handleBatchGenerate('image')}
          >
            {t('projectDetail.generateAllImages')}
          </Button>
          <Button
            icon={<VideoCameraOutlined />}
            onClick={() => handleBatchGenerate('video')}
          >
            {t('projectDetail.generateAllVideos')}
          </Button>
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
          setSelectedShot(null);
        }}
      />
    </div>
  );
}
