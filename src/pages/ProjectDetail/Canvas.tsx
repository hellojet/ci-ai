import { Button, message, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useProjectStore } from '@/stores/projectStore';
import SceneGroup from './SceneGroup';
import type { Shot } from '@/types/shot';
import type { Scene } from '@/types/scene';

const { Text } = Typography;

interface CanvasProps {
  projectId: number;
  onShotClick: (shot: Shot) => void;
  onSceneClick?: (scene: Scene) => void;
  selectedSceneId?: number | null;
}

export default function Canvas({ projectId, onShotClick, onSceneClick, selectedSceneId }: CanvasProps) {
  const { currentProject, addScene, reorderShots } = useProjectStore();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !currentProject) return;

    const activeShotId = Number(String(active.id).replace('shot-', ''));
    const overShotId = Number(String(over.id).replace('shot-', ''));
    if (!activeShotId || !overShotId) return;

    // 把每个 scene 的 shots 按 sort_order 排序，建立 sceneId -> Shot[] 的工作副本
    const sceneIdToShots = new Map<number, Shot[]>();
    for (const scene of currentProject.scenes) {
      sceneIdToShots.set(
        scene.id,
        [...scene.shots].sort((a, b) => a.sort_order - b.sort_order)
      );
    }

    // 找到 active / over 所在的 scene
    let activeSceneId: number | null = null;
    let overSceneId: number | null = null;
    for (const [sceneId, shots] of sceneIdToShots) {
      if (shots.some((shot) => shot.id === activeShotId)) activeSceneId = sceneId;
      if (shots.some((shot) => shot.id === overShotId)) overSceneId = sceneId;
    }
    if (activeSceneId === null || overSceneId === null) return;

    const affectedSceneIds: number[] = [];

    if (activeSceneId === overSceneId) {
      // 同场景内移动：用 arrayMove
      const shots = sceneIdToShots.get(activeSceneId)!;
      const fromIndex = shots.findIndex((shot) => shot.id === activeShotId);
      const toIndex = shots.findIndex((shot) => shot.id === overShotId);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
      sceneIdToShots.set(activeSceneId, arrayMove(shots, fromIndex, toIndex));
      affectedSceneIds.push(activeSceneId);
    } else {
      // 跨场景移动：从源 scene 移除，插入目标 scene 的 over 位置
      const sourceShots = sceneIdToShots.get(activeSceneId)!;
      const targetShots = sceneIdToShots.get(overSceneId)!;
      const movingShot = sourceShots.find((shot) => shot.id === activeShotId);
      if (!movingShot) return;
      const newSourceShots = sourceShots.filter((shot) => shot.id !== activeShotId);
      const overIndex = targetShots.findIndex((shot) => shot.id === overShotId);
      const newTargetShots = [...targetShots];
      newTargetShots.splice(overIndex < 0 ? newTargetShots.length : overIndex, 0, movingShot);
      sceneIdToShots.set(activeSceneId, newSourceShots);
      sceneIdToShots.set(overSceneId, newTargetShots);
      affectedSceneIds.push(activeSceneId, overSceneId);
    }

    // 把受影响场景的所有 shot 重新编号并组装请求体
    const newOrders = affectedSceneIds.flatMap((sceneId) =>
      (sceneIdToShots.get(sceneId) ?? []).map((shot, index) => ({
        shot_id: shot.id,
        scene_id: sceneId,
        sort_order: index,
      }))
    );

    if (newOrders.length === 0) return;

    try {
      await reorderShots(newOrders);
    } catch (error) {
      const detail = (error as { message?: string })?.message;
      message.error(detail ? `镜头排序失败：${detail}` : '镜头排序失败');
    }
  };

  const handleAddScene = async () => {
    try {
      const sortOrder = currentProject?.scenes.length || 0;
      await addScene({
        title: `场景 ${sortOrder + 1}`,
        sort_order: sortOrder,
      });
      message.success('场景已添加');
    } catch (error) {
      message.error((error as Error).message || '添加场景失败');
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
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddScene}>
            Add Scene
          </Button>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          {scenes.map((scene) => (
            <SceneGroup
              key={scene.id}
              scene={scene}
              projectId={projectId}
              onShotClick={onShotClick}
              onSceneClick={onSceneClick}
              isSelected={selectedSceneId === scene.id}
            />
          ))}
          <Button
            type="dashed"
            block
            icon={<PlusOutlined />}
            onClick={handleAddScene}
            style={{ marginTop: 8 }}
          >
            Add Scene
          </Button>
        </DndContext>
      )}
    </div>
  );
}
