import { Button, Empty, Typography } from 'antd';
import { LockOutlined, CheckCircleFilled } from '@ant-design/icons';
import type { ShotVideo } from '@/types/shot';

const { Text } = Typography;

interface VideoSelectorProps {
  videos: ShotVideo[];
  lockedVideoId?: number;
  onLock: (videoId: number) => void;
}

/**
 * 候选视频选择器：并列展示多条生成好的视频，允许用户锁定其中一条作为最终稿。
 *
 * 交互：
 * - 悬停视频自动播放（静音 + loop），离开暂停归零，避免同屏多卡片同时发声
 * - 锁定项用绿色边框 + 徽章标记
 * - 非锁定项右下角显示"锁定"按钮
 */
export default function VideoSelector({ videos, lockedVideoId, onLock }: VideoSelectorProps) {
  if (videos.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={<Text type="secondary" style={{ fontSize: 12 }}>暂无生成的视频</Text>}
        style={{ margin: '8px 0' }}
      />
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
      {videos.map((video) => {
        const isLocked = video.id === lockedVideoId;
        return (
          <div
            key={video.id}
            style={{
              position: 'relative',
              borderRadius: 6,
              overflow: 'hidden',
              border: isLocked ? '2px solid #52c41a' : '2px solid #2a2a2a',
              background: '#000',
            }}
          >
            <video
              src={video.video_url}
              muted
              loop
              playsInline
              preload="metadata"
              controls
              onMouseEnter={(event) => {
                void (event.currentTarget as HTMLVideoElement).play().catch(() => {});
              }}
              onMouseLeave={(event) => {
                const el = event.currentTarget as HTMLVideoElement;
                el.pause();
                el.currentTime = 0;
              }}
              style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', display: 'block' }}
            />

            {isLocked && (
              <div
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  background: 'rgba(82, 196, 26, 0.9)',
                  borderRadius: 4,
                  padding: '2px 6px',
                  pointerEvents: 'none',
                }}
              >
                <CheckCircleFilled style={{ fontSize: 10, color: '#fff' }} />
                <Text style={{ fontSize: 10, color: '#fff' }}>已锁定</Text>
              </div>
            )}

            {!isLocked && (
              <Button
                size="small"
                icon={<LockOutlined />}
                onClick={(event) => {
                  event.stopPropagation();
                  onLock(video.id);
                }}
                style={{
                  position: 'absolute',
                  bottom: 36,
                  right: 4,
                  fontSize: 11,
                }}
              >
                锁定
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
