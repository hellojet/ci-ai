import { useState } from 'react';
import { Typography, Button, Space, Popconfirm, Collapse, message } from 'antd';
import { PlusOutlined, DeleteOutlined, EnvironmentOutlined, WarningOutlined } from '@ant-design/icons';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Scene } from '@/types/scene';
import type { Shot } from '@/types/shot';
import ShotCard from './ShotCard';
import { useProjectStore } from '@/stores/projectStore';

const { Text } = Typography;

interface SceneGroupProps {
  scene: Scene;
  projectId: number;
  isEditing: boolean;
  onShotClick: (shot: Shot) => void;
}

export default function SceneGroup({ scene, projectId, isEditing, onShotClick }: SceneGroupProps) {
  const { addShot, deleteScene } = useProjectStore();
  const [activeKey, setActiveKey] = useState<string[]>([`scene-${scene.id}`]);

  const handleAddShot = async () => {
    try {
      const sortOrder = scene.shots.length;
      await addShot(scene.id, {
        title: `Shot ${scene.shots.length + 1}`,
        sort_order: sortOrder,
      });
      message.success('Shot added');
    } catch (error) {
      message.error((error as Error).message || 'Failed to add shot');
    }
  };

  const handleDeleteScene = async () => {
    try {
      await deleteScene(scene.id);
      message.success('Scene deleted');
    } catch (error) {
      message.error((error as Error).message || 'Failed to delete scene');
    }
  };

  const sortableItems = scene.shots.map((shot) => `shot-${shot.id}`);

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
      <EnvironmentOutlined style={{ color: '#a855f7' }} />
      <Text strong style={{ color: '#fff', flex: 1 }}>
        {scene.title || 'Untitled Scene'}
      </Text>
      {scene.environment ? (
        <Text style={{ fontSize: 12, color: '#52c41a' }}>{scene.environment.name}</Text>
      ) : (
        <Text style={{ fontSize: 12, color: '#faad14' }}>
          <WarningOutlined /> No scene asset
        </Text>
      )}
      <Text type="secondary" style={{ fontSize: 12 }}>
        {scene.shots.length} shots
      </Text>
    </div>
  );

  return (
    <Collapse
      activeKey={activeKey}
      onChange={(keys) => setActiveKey(keys as string[])}
      style={{
        background: '#141414',
        borderColor: '#1e1e1e',
        marginBottom: 12,
      }}
      items={[
        {
          key: `scene-${scene.id}`,
          label: header,
          children: (
            <div>
              <SortableContext items={sortableItems} strategy={verticalListSortingStrategy}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {scene.shots
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((shot) => (
                      <ShotCard
                        key={shot.id}
                        shot={shot}
                        projectId={projectId}
                        isEditing={isEditing}
                        onClick={() => onShotClick(shot)}
                      />
                    ))}
                </div>
              </SortableContext>

              {isEditing && (
                <Space style={{ marginTop: 12 }}>
                  <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={handleAddShot}>
                    Add Shot
                  </Button>
                  <Popconfirm title="Delete this scene and all shots?" onConfirm={handleDeleteScene} okButtonProps={{ danger: true }}>
                    <Button type="text" size="small" danger icon={<DeleteOutlined />}>
                      Delete Scene
                    </Button>
                  </Popconfirm>
                </Space>
              )}
            </div>
          ),
        },
      ]}
    />
  );
}
