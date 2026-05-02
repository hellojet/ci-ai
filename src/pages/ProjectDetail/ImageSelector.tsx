import { Image, Button, Empty, Typography } from 'antd';
import { LockOutlined, CheckCircleFilled } from '@ant-design/icons';
import type { ShotImage } from '@/types/shot';

const { Text } = Typography;

interface ImageSelectorProps {
  images: ShotImage[];
  lockedImageId?: number;
  onLock: (imageId: number) => void;
}

export default function ImageSelector({ images, lockedImageId, onLock }: ImageSelectorProps) {
  if (images.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={<Text type="secondary" style={{ fontSize: 12 }}>No images generated yet</Text>}
        style={{ margin: '8px 0' }}
      />
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
      {images.map((image) => {
        const isLocked = image.id === lockedImageId;
        return (
          <div
            key={image.id}
            style={{
              position: 'relative',
              borderRadius: 6,
              overflow: 'hidden',
              border: isLocked ? '2px solid #52c41a' : '2px solid #2a2a2a',
              cursor: 'pointer',
            }}
          >
            <Image
              src={image.image_url}
              alt="candidate"
              style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover' }}
              preview={{ mask: 'Preview' }}
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
                }}
              >
                <CheckCircleFilled style={{ fontSize: 10, color: '#fff' }} />
                <Text style={{ fontSize: 10, color: '#fff' }}>Locked</Text>
              </div>
            )}

            {!isLocked && (
              <Button
                size="small"
                icon={<LockOutlined />}
                onClick={(event) => {
                  event.stopPropagation();
                  onLock(image.id);
                }}
                style={{
                  position: 'absolute',
                  bottom: 4,
                  right: 4,
                  fontSize: 11,
                }}
              >
                Lock
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
