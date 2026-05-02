import { useState, useRef, useEffect } from 'react';
import { Typography, List, Button, Empty, Select, Space, message, Input } from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  EnvironmentOutlined,
  CloseOutlined,
  PictureOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useProjectStore } from '@/stores/projectStore';
import { useAssetStore } from '@/stores/assetStore';
import type { Shot } from '@/types/shot';
import type { Scene } from '@/types/scene';

const { Text, Title } = Typography;
const { TextArea } = Input;

interface PreviewPlayerProps {
  selectedScene?: Scene | null;
  onCloseScene?: () => void;
}

export default function PreviewPlayer({ selectedScene, onCloseScene }: PreviewPlayerProps = {}) {
  const { currentProject, updateScene } = useProjectStore();
  const { environments, fetchEnvironments } = useAssetStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentShotId, setCurrentShotId] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // 场景面板本地编辑态
  const [sceneTitle, setSceneTitle] = useState('');
  const [sceneDesc, setSceneDesc] = useState('');
  const [sceneEnvId, setSceneEnvId] = useState<number | undefined>(undefined);
  const [savingScene, setSavingScene] = useState(false);

  // 打开场景面板时初始化表单，并拉取资产库环境列表
  useEffect(() => {
    if (selectedScene) {
      setSceneTitle(selectedScene.title || '');
      setSceneDesc(selectedScene.description_prompt || '');
      setSceneEnvId(selectedScene.environment_id);
      if (environments.length === 0) {
        fetchEnvironments({ page: 1, page_size: 100 });
      }
    }
  }, [selectedScene?.id]);

  const handleSaveScene = async () => {
    if (!selectedScene) return;
    setSavingScene(true);
    try {
      await updateScene(selectedScene.id, {
        title: sceneTitle,
        description_prompt: sceneDesc,
        environment_id: sceneEnvId,
      });
      message.success('场景已保存');
    } catch (error) {
      message.error((error as Error).message || '保存场景失败');
    } finally {
      setSavingScene(false);
    }
  };

  const currentEnv = selectedScene?.environment
    || environments.find((env) => env.id === sceneEnvId);

  const allShots: Shot[] =
    currentProject?.scenes
      .flatMap((scene) => scene.shots)
      .filter((shot) => shot.video_url) || [];

  const currentShot = allShots.find((shot) => shot.id === currentShotId);

  useEffect(() => {
    if (allShots.length > 0 && !currentShotId) {
      setCurrentShotId(allShots[0].id);
    }
  }, [allShots.length]);

  const handlePlay = (shotId: number) => {
    setCurrentShotId(shotId);
    setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.play();
        setIsPlaying(true);
      }
    }, 100);
  };

  const handleVideoEnd = () => {
    const currentIndex = allShots.findIndex((shot) => shot.id === currentShotId);
    if (currentIndex < allShots.length - 1) {
      handlePlay(allShots[currentIndex + 1].id);
    } else {
      setIsPlaying(false);
    }
  };

  // 场景详情面板（选中场景时优先展示）
  if (selectedScene) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#141414', borderLeft: '1px solid #1e1e1e' }}>
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #1e1e1e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Title level={5} style={{ margin: 0, color: '#fff', fontSize: 14 }}>
            <EnvironmentOutlined style={{ marginRight: 6, color: '#a855f7' }} />
            场景信息
          </Title>
          <Button type="text" size="small" icon={<CloseOutlined />} onClick={onCloseScene} />
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 场景标题 */}
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              场景标题
            </Text>
            <Input
              value={sceneTitle}
              onChange={(event) => setSceneTitle(event.target.value)}
              placeholder="输入场景标题"
            />
          </div>

          {/* 场景描述 */}
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              场景描述
            </Text>
            <TextArea
              value={sceneDesc}
              onChange={(event) => setSceneDesc(event.target.value)}
              rows={3}
              placeholder="场景的视觉风格、气氛、关键元素..."
            />
          </div>

          {/* 关联场景资产 */}
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              关联场景资产
            </Text>
            <Select
              value={sceneEnvId}
              onChange={setSceneEnvId}
              placeholder="选择资产库中的场景环境"
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: '100%' }}
              options={environments.map((env) => ({
                value: env.id,
                label: env.name,
              }))}
            />
          </div>

          {/* 关联的场景环境预览 */}
          {currentEnv && (
            <div
              style={{
                border: '1px solid #262626',
                borderRadius: 6,
                padding: 8,
                background: '#0f0f0f',
              }}
            >
              <Text style={{ color: '#52c41a', fontSize: 12, display: 'block', marginBottom: 6 }}>
                已关联：{currentEnv.name}
              </Text>
              {currentEnv.images && currentEnv.images.length > 0 ? (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 6,
                  }}
                >
                  {currentEnv.images.slice(0, 4).map((img) => (
                    <img
                      key={img.id}
                      src={img.image_url}
                      alt={currentEnv.name}
                      style={{
                        width: '100%',
                        aspectRatio: '16 / 9',
                        objectFit: 'cover',
                        borderRadius: 4,
                        background: '#000',
                      }}
                    />
                  ))}
                </div>
              ) : currentEnv.base_image_url ? (
                <img
                  src={currentEnv.base_image_url}
                  alt={currentEnv.name}
                  style={{
                    width: '100%',
                    aspectRatio: '16 / 9',
                    objectFit: 'cover',
                    borderRadius: 4,
                    background: '#000',
                  }}
                />
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 16,
                    color: '#666',
                  }}
                >
                  <PictureOutlined style={{ fontSize: 20, marginRight: 6 }} />
                  <Text type="secondary" style={{ fontSize: 12 }}>暂无场景图片</Text>
                </div>
              )}
            </div>
          )}

          {/* 镜头总览 */}
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              本场景镜头（{selectedScene.shots.length}）
            </Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {selectedScene.shots
                .slice()
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((shot) => (
                  <div
                    key={shot.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 6px',
                      background: '#1a1a1a',
                      borderRadius: 4,
                    }}
                  >
                    <Text style={{ color: '#ddd', fontSize: 12, flex: 1, minWidth: 0 }} ellipsis>
                      {shot.title || `Shot ${shot.id}`}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {shot.status}
                    </Text>
                  </div>
                ))}
            </div>
          </div>
        </div>

        <div
          style={{
            padding: '10px 12px',
            borderTop: '1px solid #1e1e1e',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <Space>
            <Button size="small" onClick={onCloseScene}>取消</Button>
            <Button
              type="primary"
              size="small"
              icon={<SaveOutlined />}
              loading={savingScene}
              onClick={handleSaveScene}
            >
              保存
            </Button>
          </Space>
        </div>
      </div>
    );
  }

  if (allShots.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#141414', borderLeft: '1px solid #1e1e1e' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e1e1e' }}>
          <Title level={5} style={{ margin: 0, color: '#fff', fontSize: 14 }}>
            <PlayCircleOutlined style={{ marginRight: 6 }} />
            Preview
          </Title>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<Text type="secondary">点击左侧场景头部可查看/关联场景资产</Text>}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#141414', borderLeft: '1px solid #1e1e1e' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e1e1e' }}>
        <Title level={5} style={{ margin: 0, color: '#fff', fontSize: 14 }}>
          <PlayCircleOutlined style={{ marginRight: 6 }} />
          Preview
        </Title>
      </div>

      {/* Video Player */}
      <div style={{ padding: 12 }}>
        {currentShot?.video_url ? (
          <video
            ref={videoRef}
            src={currentShot.video_url}
            controls
            onEnded={handleVideoEnd}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            style={{ width: '100%', borderRadius: 6, background: '#000' }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              aspectRatio: '16/9',
              background: '#000',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text type="secondary">Select a shot to preview</Text>
          </div>
        )}
      </div>

      {/* Playlist */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 12px 12px' }}>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
          Playlist ({allShots.length} clips)
        </Text>
        <List
          size="small"
          dataSource={allShots}
          renderItem={(shot) => (
            <List.Item
              onClick={() => handlePlay(shot.id)}
              style={{
                cursor: 'pointer',
                background: shot.id === currentShotId ? '#a855f720' : 'transparent',
                borderRadius: 4,
                padding: '6px 8px',
                borderBottom: '1px solid #1e1e1e',
              }}
              actions={[
                <Button
                  key="play"
                  type="text"
                  size="small"
                  icon={
                    shot.id === currentShotId && isPlaying ? (
                      <PauseCircleOutlined style={{ color: '#a855f7' }} />
                    ) : (
                      <PlayCircleOutlined style={{ color: '#888' }} />
                    )
                  }
                />,
              ]}
            >
              <List.Item.Meta
                title={
                  <Text style={{ color: shot.id === currentShotId ? '#a855f7' : '#fff', fontSize: 12 }}>
                    {shot.title || `Shot ${shot.id}`}
                  </Text>
                }
              />
            </List.Item>
          )}
        />
      </div>
    </div>
  );
}
