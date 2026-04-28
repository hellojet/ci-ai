import { create } from 'zustand';
import type { GenerationTask, TaskType } from '@/types/generation';
import * as generationApi from '@/api/generation';

interface GenerationState {
  tasks: Record<number, GenerationTask[]>;
  loading: boolean;

  generateForShot: (projectId: number, shotId: number, taskType: TaskType) => Promise<void>;
  generateAll: (projectId: number, taskType: TaskType) => Promise<void>;
  retryTask: (projectId: number, taskId: number) => Promise<void>;
  fetchTasks: (projectId: number) => Promise<void>;
  updateTaskStatus: (taskId: number, shotId: number, status: string, progress?: number) => void;
}

export const useGenerationStore = create<GenerationState>((set) => ({
  tasks: {},
  loading: false,

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
