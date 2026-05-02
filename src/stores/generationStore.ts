import { create } from 'zustand';
import type { GenerationTask, TaskType } from '@/types/generation';
import * as generationApi from '@/api/generation';

// 任务终态集合：一旦任务到达这些状态就停止轮询
// 与后端保持一致：completed / failed / cancelled 才算终态
const TERMINAL_TASK_STATUSES = new Set(['completed', 'failed', 'cancelled']);

interface GenerationState {
  tasks: Record<number, GenerationTask[]>;
  loading: boolean;
  // 记录每个 shot 当前是否正在轮询，以避免重复启动多个定时器
  pollingShotIds: Set<number>;

  generateForShot: (projectId: number, shotId: number, taskType: TaskType) => Promise<void>;
  generateAll: (projectId: number, taskType: TaskType) => Promise<void>;
  retryTask: (projectId: number, taskId: number) => Promise<void>;
  fetchTasks: (projectId: number) => Promise<void>;
  fetchShotTasks: (projectId: number, shotId: number) => Promise<GenerationTask[]>;
  pollShotTasks: (projectId: number, shotId: number) => void;
  updateTaskStatus: (taskId: number, shotId: number, status: string, progress?: number) => void;
}

export const useGenerationStore = create<GenerationState>((set, get) => ({
  tasks: {},
  loading: false,
  pollingShotIds: new Set<number>(),

  generateForShot: async (projectId, shotId, taskType) => {
    set({ loading: true });
    try {
      const response = await generationApi.generateForShot(projectId, shotId, { task_type: taskType });
      set((state) => {
        const shotTasks = state.tasks[shotId] || [];
        const newTask: GenerationTask = {
          id: response.task_id,
          shot_id: shotId,
          task_type: response.task_type,
          status: response.status,
          retry_count: 0,
          credits_cost: response.credits_cost,
          created_by: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        return { tasks: { ...state.tasks, [shotId]: [...shotTasks, newTask] }, loading: false };
      });
      // 提交成功后立刻启动轮询，UI 徽章能实时反映"排队中/生成中/生成完成"
      get().pollShotTasks(projectId, shotId);
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  generateAll: async (projectId, taskType) => {
    set({ loading: true });
    try {
      const response = await generationApi.generateAll(projectId, { task_type: taskType });
      set((state) => {
        const updatedTasks = { ...state.tasks };
        for (const task of response.tasks) {
          const shotTasks = updatedTasks[task.shot_id] || [];
          shotTasks.push({
            id: task.task_id,
            shot_id: task.shot_id,
            task_type: taskType,
            status: task.status,
            retry_count: 0,
            credits_cost: taskType === 'image' ? 2 : taskType === 'video' ? 10 : 0,
            created_by: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          updatedTasks[task.shot_id] = shotTasks;
        }
        return { tasks: updatedTasks, loading: false };
      });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  retryTask: async (projectId, taskId) => {
    await generationApi.retryTask(projectId, taskId);
  },

  fetchTasks: async (projectId) => {
    try {
      const result = await generationApi.getTasks(projectId);
      const tasksByShot: Record<number, GenerationTask[]> = {};
      for (const task of result.items) {
        if (!tasksByShot[task.shot_id]) {
          tasksByShot[task.shot_id] = [];
        }
        tasksByShot[task.shot_id].push(task);
      }
      set({ tasks: tasksByShot });
    } catch {
      // silently fail
    }
  },

  fetchShotTasks: async (projectId, shotId) => {
    const shotTasks = await generationApi.getShotTasks(projectId, shotId);
    set((state) => ({ tasks: { ...state.tasks, [shotId]: shotTasks } }));
    return shotTasks;
  },

  pollShotTasks: (projectId, shotId) => {
    // 同一个 shot 已经在轮询就跳过，避免并发定时器
    if (get().pollingShotIds.has(shotId)) return;
    const ids = new Set(get().pollingShotIds);
    ids.add(shotId);
    set({ pollingShotIds: ids });

    const POLL_INTERVAL_MS = 2000;
    const MAX_POLLS = 150; // 最多轮询 5 分钟，足够一般的图片/视频生成
    let polls = 0;

    const stopPolling = () => {
      const next = new Set(get().pollingShotIds);
      next.delete(shotId);
      set({ pollingShotIds: next });
    };

    const tick = async () => {
      polls += 1;
      let shouldStop = false;
      try {
        const shotTasks = await get().fetchShotTasks(projectId, shotId);
        const activeTasks = shotTasks.filter(
          (task) => !TERMINAL_TASK_STATUSES.has(task.status)
        );
        if (activeTasks.length === 0) {
          shouldStop = true;
          // 所有任务到终态，拉一次项目以刷新 shot.images / video_url / shot.status
          // 动态 import 避免 generationStore 和 projectStore 之间的循环依赖（会导致页面白屏/黑屏）
          try {
            const { useProjectStore } = await import('./projectStore');
            await useProjectStore.getState().fetchProject(projectId);
          } catch {
            // 忽略刷新失败，不影响轮询结束
          }
        }
      } catch {
        // 单次拉取失败不算致命，继续下一轮
      }

      if (shouldStop || polls >= MAX_POLLS) {
        stopPolling();
        return;
      }
      setTimeout(tick, POLL_INTERVAL_MS);
    };

    // 立即执行一次，然后进入定时循环
    setTimeout(tick, POLL_INTERVAL_MS);
  },

  updateTaskStatus: (taskId, shotId, status, _progress) => {
    set((state) => {
      const shotTasks = state.tasks[shotId] || [];
      return {
        tasks: {
          ...state.tasks,
          [shotId]: shotTasks.map((task) =>
            task.id === taskId ? { ...task, status: status as GenerationTask['status'] } : task
          ),
        },
      };
    });
  },
}));
