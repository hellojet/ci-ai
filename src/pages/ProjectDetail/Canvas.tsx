import { Button, message, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useProjectStore } from '@/stores/projectStore';
import SceneGroup from './SceneGroup';
import type { Shot } from '@/types/shot';

const { Text } = Typography;

interface CanvasProps {
  projectId: number;
  onShotClick: (shot: Shot) => void;
}

export default function Canvas({ projectId, onShotClick }: CanvasProps) {
  const { currentProject, isEditing, addScene, reorderShots } = useProjectStore();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !currentProject) return;

    const activeShotId = Number(String(active.id).replace('shot-', ''));
    const overShotId = Number(String(over.id).replace('shot-', ''));

    const allShots = currentProject.scenes.flatMap((scene) =>
      scene.shots.map((shot) => ({ ...shot, sceneId: scene.id }))
    );

    const activeShot = allShots.find((shot) => shot.id === activeShotId);
    const overShot = allShots.find((shot) => shot.id === overShotId);

    if (!activeShot || !overShot) return;

    const targetSceneShots = allShots
      .filter((shot) => shot.sceneId === overShot.sceneId)
      .sort((a, b) => a.sort_order - b.sort_order);

    const overIndex = targetSceneShots.findIndex((shot) => shot.id === overShotId);

    const newOrders = targetSceneShots
      .filter((shot) => shot.id !== activeShotId)
      .map((shot, index) => ({
        shot_id: shot.id,
        scene_id: overShot.sceneId,
        sort_order: index >= overIndex ? index + 1 : index,
      }));

    newOrders.push({
      shot_id: activeShotId,
      scene_id: overShot.sceneId,
      sort_order: overIndex,
    });

    try {
      await reorderShots(newOrders);
    } catch {
      message.error('Failed to reorder shots');
    }
  };

  const handleAddScene = async () => {
    try {
      const sortOrder = currentProject?.scenes.length || 0;
      await addScene({
        title: `Scene ${sortOrder + 1}`,
        sort_order: sortOrder,
      });
      message.success('Scene added');
    } catch (error) {
      message.error((error as Error).message || 'Failed to add scene');
    }
  };

  const scenes = currentProject?.scenes.sort((a, b) => a.sort_order - b.sort_order) || [];

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 16 }}>
      {scenes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            No scenes yet. Parse a script or add scenes manually.
          </Text>
          {isEditing && (
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAddScene}>
              Add Scene
            </Button>
          )}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          {scenes.map((scene) => (
            <SceneGroup
              key={scene.id}
              scene={scene}
              projectId={projectId}
              isEditing={isEditing}
              onShotClick={onShotClick}
            />
          ))}
          {isEditing && (
            <Button
              type="dashed"
              block
              icon={<PlusOutlined />}
              onClick={handleAddScene}
              style={{ marginTop: 8 }}
            >
              Add Scene
            </Button>
          )}
        </DndContext>
      )}
    </div>
  );
}
