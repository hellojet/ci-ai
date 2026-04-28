import { Card, Typography, Space, Button, Tooltip, Popconfirm, message } from 'antd';
import {
  PictureOutlined,
  VideoCameraOutlined,
  AudioOutlined,
  DeleteOutlined,
  LockOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Shot } from '@/types/shot';
import StatusBadge from '@/components/StatusBadge';
import { useProjectStore } from '@/stores/projectStore';
import { useGenerationStore } from '@/stores/generationStore';
import { CAMERA_ANGLES } from '@/utils/constants';

const { Text } = Typography;

interface ShotCardProps {
  shot: Shot;
  projectId: number;
  isEditing: boolean;
  onClick: () => void;
}

export default function ShotCard({ shot, projectId, isEditing, onClick }: ShotCardProps) {
  const { deleteShot } = useProjectStore();
  const { generateForShot } = useGenerationStore();

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `shot-${shot.id}`,
    disabled: !isEditing,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const lockedImage = shot.images.find((img) => img.is_locked);
  const cameraLabel = CAMERA_ANGLES.find((angle) => angle.value === shot.camera_angle)?.label;

  const handleGenerate = async (taskType: 'image' | 'video' | 'audio', event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await generateForShot(projectId, shot.id, taskType);
      message.success(`${taskType} generation started`);
    } catch (error) {
      message.error((error as Error).message || 'Generation failed');
    }
  };

  const handleDelete = async (event?: React.MouseEvent) => {
    event?.stopPropagation();
    try {
      await deleteShot(shot.id);
      message.success('Shot deleted');
    } catch (error) {
      message.error((error as Error).message || 'Failed to delete shot');
    }
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Card
        size="small"
        hoverable
        onClick={onClick}
        style={{
          background: '#1a1a1a',
          borderColor: '#2a2a2a',
          cursor: 'pointer',
        }}
        styles={{ body: { padding: 12 } }}
      >
        <div style={{ display: 'flex', gap: 12 }}>
          {/* Thumbnail / Drag handle */}
          <div
            {...listeners}
            style={{
              width: 80,
              height: 60,
              borderRadius: 6,
              background: '#0c0c0c',
              flexShrink: 0,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: isEditing ? 'grab' : 'pointer',
            }}
          >
            {lockedImage ? (
              <img
                src={lockedImage.image_url}
                alt="shot"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : shot.images.length > 0 ? (
              <img
                src={shot.images[0].image_url}
                alt="shot"
                style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }}
              />
            ) : (
              <PictureOutlined style={{ color: '#444', fontSize: 20 }} />
            )}
            {lockedImage && (
              <LockOutlined
                style={{
                  position: 'absolute',
                  bottom: 4,
                  right: 4,
                  color: '#52c41a',
                  fontSize: 12,
                  background: 'rgba(0,0,0,0.6)',
                  borderRadius: '50%',
                  padding: 2,
                }}
              />
            )}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Text strong style={{ color: '#fff', fontSize: 13 }} ellipsis>
                {shot.title || `Shot`}
              </Text>
              <StatusBadge status={shot.status} type="shot" />
            </div>

            {shot.narration && (
              <Text type="secondary" style={{ fontSize: 12, display: 'block' }} ellipsis>
                {shot.narration}
              </Text>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
              {cameraLabel && (
                <Text style={{ fontSize: 11, color: '#a855f7', background: '#a855f720', padding: '0 4px', borderRadius: 3 }}>
                  {cameraLabel}
                </Text>
              )}
              {shot.characters.map((char) => (
                <Text key={char.id} style={{ fontSize: 11, color: '#888', background: '#ffffff10', padding: '0 4px', borderRadius: 3 }}>
                  {char.name}
                </Text>
              ))}
              {shot.images.length > 0 && (
                <Text style={{ fontSize: 11, color: '#666' }}>
                  {shot.images.length} img{shot.images.length > 1 ? 's' : ''}
                </Text>
              )}
              {shot.video_url && <CheckCircleOutlined style={{ color: '#722ed1', fontSize: 11 }} />}
              {shot.audio_url && <AudioOutlined style={{ color: '#52c41a', fontSize: 11 }} />}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Space size={4}>
              <Tooltip title="Generate Images">
                <Button
                  type="text"
                  size="small"
                  icon={<PictureOutlined />}
                  onClick={(event) => handleGenerate('image', event)}
                  style={{ color: '#888' }}
                />
              </Tooltip>
              <Tooltip title="Generate Video">
                <Button
                  type="text"
                  size="small"
                  icon={<VideoCameraOutlined />}
                  onClick={(event) => handleGenerate('video', event)}
                  disabled={!shot.locked_image_id}
                  style={{ color: shot.locked_image_id ? '#888' : '#444' }}
                />
              </Tooltip>
              {isEditing && (
                <Popconfirm
                  title="Delete this shot?"
                  onConfirm={() => handleDelete()}
                  onCancel={(event) => event?.stopPropagation()}
                >
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={(event) => event.stopPropagation()}
                  />
                </Popconfirm>
              )}
            </Space>
          </div>
        </div>
      </Card>
    </div>
  );
}
