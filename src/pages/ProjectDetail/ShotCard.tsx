import { useEffect, useState } from 'react';
import { Card, Typography, Space, Button, Tooltip, Popconfirm, message } from 'antd';
import {
  PictureOutlined,
  VideoCameraOutlined,
  AudioOutlined,
  DeleteOutlined,
  LockOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  DragOutlined,
} from '@ant-design/icons';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Shot } from '@/types/shot';
import type { GenerationTask } from '@/types/generation';
import StatusBadge from '@/components/StatusBadge';
import { useProjectStore } from '@/stores/projectStore';
import { useGenerationStore } from '@/stores/generationStore';
import { CAMERA_ANGLES } from '@/utils/constants';
import { useLocale } from '@/hooks/useLocale';

const { Text } = Typography;

type GenTaskType = 'image' | 'video' | 'audio';

interface ShotCardProps {
  shot: Shot;
  projectId: number;
  onClick: () => void;
}

// 任务终态集合：到达这些状态后不再认为是"生成中"
// 与后端 app/tasks/generation_tasks.py 保持一致
const TERMINAL_TASK_STATUSES = new Set(['completed', 'failed', 'cancelled']);
// 共享的空数组常量，避免 zustand selector 每次返回新引用触发无限 rerender
const EMPTY_TASKS: GenerationTask[] = [];

export default function ShotCard({ shot, projectId, onClick }: ShotCardProps) {
  const { deleteShot } = useProjectStore();
  const { generateForShot, fetchShotTasks, pollShotTasks } = useGenerationStore();
  // 注意：selector 不能每次返回新数组（?? []），会触发 zustand 的无限循环警告。
  // 这里返回原引用（可能为 undefined），下面再做空数组兜底。
  const shotTasksRaw = useGenerationStore((state) => state.tasks[shot.id]);
  const shotTasks = shotTasksRaw ?? EMPTY_TASKS;
  const { t } = useLocale();

  // 提交瞬间的本地 loading（API 返回前），拿到 task 后就切换到 task.status 驱动
  const [submittingType, setSubmittingType] = useState<GenTaskType | null>(null);

  // 按 updated_at 找每种任务类型的最新一条任务
  const latestTaskByType = shotTasks.reduce<Record<string, GenerationTask>>((acc, task) => {
    const prev = acc[task.task_type];
    if (!prev || new Date(task.updated_at) > new Date(prev.updated_at)) {
      acc[task.task_type] = task;
    }
    return acc;
  }, {});

  // 当前活跃（非终态）任务：用于驱动遮罩 / loading / 状态徽章
  const activeTask = Object.values(latestTaskByType).find(
    (task) => !TERMINAL_TASK_STATUSES.has(task.status)
  );

  // 用于徽章显示的 "主任务"：优先显示活跃任务，否则显示最新的完成/失败任务
  const displayTask = activeTask
    ?? Object.values(latestTaskByType).sort((a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )[0];

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `shot-${shot.id}`,
    disabled: false,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const lockedImage = shot.images.find((img) => img.is_locked);
  // 缩略图用的视频：优先 locked_video，其次兼容老数据里的 shot.video_url
  const lockedVideo = shot.videos?.find((video) => video.is_locked);
  const thumbnailVideoUrl = lockedVideo?.video_url ?? shot.video_url;
  const cameraLabel = CAMERA_ANGLES.find((angle) => angle.value === shot.camera_angle)?.label;

  // 组件挂载时拉一次该 shot 的 tasks：刷新后首次进入页面也能看到正在跑的任务
  useEffect(() => {
    fetchShotTasks(projectId, shot.id).catch(() => {
      /* silent */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, shot.id]);

  // 如果已有活跃任务（例如刷新页面后还在跑），自动接上轮询
  useEffect(() => {
    if (activeTask) {
      pollShotTasks(projectId, shot.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTask?.id]);

  // 卡片是否处于"生成进行中"视觉态：提交中 OR 有活跃任务
  const isGenerating = submittingType !== null || activeTask !== undefined;
  // 决定遮罩文案的任务类型：优先活跃任务，否则用刚提交的类型
  const runningTaskType: GenTaskType | null =
    (activeTask?.task_type as GenTaskType | undefined) ?? submittingType;

  const handleGenerate = async (taskType: GenTaskType, event: React.MouseEvent) => {
    event.stopPropagation();
    if (isGenerating) return; // 防重复点击
    setSubmittingType(taskType);
    try {
      await generateForShot(projectId, shot.id, taskType);
      message.success(t('shotCard.generationStarted'));
      // generateForShot 内部已经启动 pollShotTasks，这里不再重复
    } catch (error) {
      message.error((error as Error).message || t('shotCard.generationFailed'));
    } finally {
      setSubmittingType(null);
    }
  };

  const handleDelete = async (event?: React.MouseEvent) => {
    event?.stopPropagation();
    try {
      await deleteShot(shot.id);
      message.success('镜头已删除');
    } catch (error) {
      message.error((error as Error).message || '删除镜头失败');
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
          borderColor: isGenerating ? '#a855f7' : '#2a2a2a',
          cursor: 'pointer',
          boxShadow: isGenerating ? '0 0 8px rgba(168, 85, 247, 0.35)' : undefined,
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}
        styles={{ body: { padding: 10 } }}
      >
        {/* 竖向布局：缩略图在上，信息在下，适配 3 列 Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Thumbnail */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '16 / 9',
              borderRadius: 6,
              background: '#0c0c0c',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {thumbnailVideoUrl ? (
              // 已生成视频：优先显示锁定的视频，悬停播放，离开暂停；用 locked/首张图作为 poster 保证加载期间有画面
              <video
                src={thumbnailVideoUrl}
                poster={lockedImage?.image_url || shot.images[0]?.image_url}
                muted
                loop
                playsInline
                preload="metadata"
                onMouseEnter={(e) => {
                  void (e.currentTarget as HTMLVideoElement).play().catch(() => {});
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLVideoElement;
                  el.pause();
                  el.currentTime = 0;
                }}
                style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }}
              />
            ) : lockedImage ? (
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
              <PictureOutlined style={{ color: '#444', fontSize: 28 }} />
            )}

            {/* 生成中的遮罩：根据任务状态区分 排队中 / 生成中 */}
            {isGenerating && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(0, 0, 0, 0.55)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#c084fc',
                  gap: 6,
                  pointerEvents: 'none',
                }}
              >
                <LoadingOutlined style={{ fontSize: 20 }} spin />
                <Text style={{ fontSize: 11, color: '#c084fc' }}>
                  {t(
                    activeTask?.status === 'processing'
                      ? `shotCard.running_${runningTaskType ?? 'image'}`
                      : `shotCard.queued_${runningTaskType ?? 'image'}`
                  )}
                </Text>
              </div>
            )}

            {lockedImage && !isGenerating && (
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

            {/* 拖拽把手：右上角，单独接管拖拽监听，避免与缩略图整张冲突 */}
            <div
              {...listeners}
              onClick={(event) => event.stopPropagation()}
              title="Drag to reorder"
              style={{
                position: 'absolute',
                top: 4,
                left: 4,
                width: 22,
                height: 22,
                borderRadius: 4,
                background: 'rgba(0, 0, 0, 0.55)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'grab',
                color: '#ddd',
              }}
            >
              <DragOutlined style={{ fontSize: 12 }} />
            </div>
          </div>

          {/* Info */}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Text strong style={{ color: '#fff', fontSize: 13, flex: 1, minWidth: 0 }} ellipsis>
                {shot.title || `镜头`}
              </Text>
              {/* 有任务时优先显示任务状态徽章（排队中/生成中/已完成/失败），否则回退显示 shot 状态 */}
              {displayTask ? (
                <StatusBadge status={displayTask.status} type="task" />
              ) : (
                <StatusBadge status={shot.status} type="shot" />
              )}
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
                  {shot.images.length} 张图
                </Text>
              )}
              {shot.video_url && <CheckCircleOutlined style={{ color: '#722ed1', fontSize: 11 }} />}
              {shot.audio_url && <AudioOutlined style={{ color: '#52c41a', fontSize: 11 }} />}
            </div>
          </div>

          {/* Actions */}
          <Space size={4} style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Tooltip title="生成图片">
              <Button
                type="text"
                size="small"
                icon={<PictureOutlined />}
                loading={runningTaskType === 'image'}
                disabled={isGenerating && runningTaskType !== 'image'}
                onClick={(event) => handleGenerate('image', event)}
                style={{ color: '#888' }}
              />
            </Tooltip>
            <Tooltip title={shot.locked_image_id ? '生成视频' : '请先锁定一张图片'}>
              <Button
                type="text"
                size="small"
                icon={<VideoCameraOutlined />}
                loading={runningTaskType === 'video'}
                onClick={(event) => handleGenerate('video', event)}
                disabled={!shot.locked_image_id || (isGenerating && runningTaskType !== 'video')}
                style={{ color: shot.locked_image_id ? '#888' : '#444' }}
              />
            </Tooltip>
            <Popconfirm
              title="确定删除此镜头？"
              okText="删除"
              cancelText="取消"
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
          </Space>
        </div>
      </Card>
    </div>
  );
}
