import { useState, useRef, useEffect } from 'react';
import { Typography, List, Button, Empty } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined } from '@ant-design/icons';
import { useProjectStore } from '@/stores/projectStore';
import type { Shot } from '@/types/shot';

const { Text, Title } = Typography;

export default function PreviewPlayer() {
  const { currentProject } = useProjectStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentShotId, setCurrentShotId] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

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
            description={<Text type="secondary">No videos generated yet</Text>}
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
