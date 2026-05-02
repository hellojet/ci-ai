import { useState } from 'react';
import { Typography, Button, Space, Popconfirm, Collapse, message } from 'antd';
import { PlusOutlined, DeleteOutlined, EnvironmentOutlined, WarningOutlined } from '@ant-design/icons';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import type { Scene } from '@/types/scene';
import type { Shot } from '@/types/shot';
import ShotCard from './ShotCard';
import { useProjectStore } from '@/stores/projectStore';

const { Text } = Typography;

interface SceneGroupProps {
  scene: Scene;
  projectId: number;
  onShotClick: (shot: Shot) => void;
  onSceneClick?: (scene: Scene) => void;
  isSelected?: boolean;
}

export default function SceneGroup({ scene, projectId, onShotClick, onSceneClick, isSelected }: SceneGroupProps) {
  const { addShot, deleteScene } = useProjectStore();
  const [activeKey, setActiveKey] = useState<string[]>([`scene-${scene.id}`]);

  const handleAddShot = async () => {
    try {
      const sortOrder = scene.shots.length;
      await addShot(scene.id, {
        title: `镜头 ${scene.shots.length + 1}`,
        sort_order: sortOrder,
      });
      message.success('镜头已添加');
    } catch (error) {
      message.error((error as Error).message || '添加镜头失败');
    }
  };

  const handleDeleteScene = async () => {
    try {
      await deleteScene(scene.id);
      message.success('场景已删除');
    } catch (error) {
      message.error((error as Error).message || '删除场景失败');
    }
  };

  const sortableItems = scene.shots.map((shot) => `shot-${shot.id}`);

  const handleHeaderClick = (event: React.MouseEvent) => {
    // 阻止冒泡到 Collapse 的折叠切换
    event.stopPropagation();
    onSceneClick?.(scene);
  };

  const header = (
    <div
      onClick={handleHeaderClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        cursor: 'pointer',
        padding: '2px 4px',
        borderRadius: 4,
        background: isSelected ? '#a855f720' : 'transparent',
        border: isSelected ? '1px solid #a855f7' : '1px solid transparent',
        transition: 'background 0.2s, border-color 0.2s',
      }}
    >
      <EnvironmentOutlined style={{ color: isSelected ? '#c084fc' : '#a855f7' }} />
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
        borderColor: isSelected ? '#a855f7' : '#1e1e1e',
        marginBottom: 12,
      }}
      items={[
        {
          key: `scene-${scene.id}`,
          label: header,
          children: (
            <div>
              <SortableContext items={sortableItems} strategy={rectSortingStrategy}>
                {/* 3 列网格布局：一排三个镜头 */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    gap: 12,
                  }}
                >
                  {scene.shots
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((shot) => (
                      <ShotCard
                        key={shot.id}
                        shot={shot}
                        projectId={projectId}
                        onClick={() => onShotClick(shot)}
                      />
                    ))}
                </div>
              </SortableContext>

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
            </div>
          ),
        },
      ]}
    />
  );
}
