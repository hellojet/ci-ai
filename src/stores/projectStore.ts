import { create } from 'zustand';
import type { ProjectDetail } from '@/types/project';
import type { User } from '@/types/user';
import type { Scene } from '@/types/scene';
import type { Shot, ShotImage } from '@/types/shot';
import type { TaskProgressEvent, TaskCompletedEvent, LockChangedEvent } from '@/types/websocket';
import * as projectApi from '@/api/projects';
import * as sceneApi from '@/api/scenes';
import * as shotApi from '@/api/shots';
import type { CreateSceneRequest, UpdateSceneRequest, SceneOrder } from '@/types/scene';
import type { CreateShotRequest, UpdateShotRequest, ShotOrder } from '@/types/shot';

interface ProjectState {
  currentProject: ProjectDetail | null;
  isEditing: boolean;
  lockedBy: User | null;
  loading: boolean;

  fetchProject: (id: number) => Promise<void>;
  updateProject: (data: { name?: string; description?: string; style_id?: number; shots_per_image?: number }) => Promise<void>;
  clearProject: () => void;

  addScene: (data: CreateSceneRequest) => Promise<void>;
  updateScene: (sceneId: number, data: UpdateSceneRequest) => Promise<void>;
  deleteScene: (sceneId: number) => Promise<void>;
  reorderScenes: (orders: SceneOrder[]) => Promise<void>;

  addShot: (sceneId: number, data: CreateShotRequest) => Promise<void>;
  updateShot: (shotId: number, data: UpdateShotRequest) => Promise<void>;
  deleteShot: (shotId: number) => Promise<void>;
  reorderShots: (orders: ShotOrder[]) => Promise<void>;
  lockImage: (shotId: number, imageId: number) => Promise<void>;

  setEditing: (editing: boolean) => void;
  setLockedBy: (user: User | null) => void;

  onTaskProgress: (data: TaskProgressEvent) => void;
  onTaskCompleted: (data: TaskCompletedEvent) => void;
  onLockChanged: (data: LockChangedEvent) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  currentProject: null,
  isEditing: false,
  lockedBy: null,
  loading: false,

  fetchProject: async (id) => {
    set({ loading: true });
    try {
      const project = await projectApi.getProject(id);
      set({
        currentProject: project,
        lockedBy: project.locked_by || null,
        loading: false,
      });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  updateProject: async (data) => {
    const project = get().currentProject;
    if (!project) return;
    const updated = await projectApi.updateProject(project.id, data);
    set((state) => ({
      currentProject: state.currentProject ? { ...state.currentProject, ...updated } : null,
    }));
  },

  clearProject: () => {
    set({ currentProject: null, isEditing: false, lockedBy: null });
  },

  addScene: async (data) => {
    const project = get().currentProject;
    if (!project) return;
    const scene = await sceneApi.createScene(project.id, data);
    set((state) => ({
      currentProject: state.currentProject
        ? { ...state.currentProject, scenes: [...state.currentProject.scenes, { ...scene, shots: [] }] }
        : null,
    }));
  },

  updateScene: async (sceneId, data) => {
    const project = get().currentProject;
    if (!project) return;
    const updated = await sceneApi.updateScene(project.id, sceneId, data);
    set((state) => ({
      currentProject: state.currentProject
        ? {
            ...state.currentProject,
            scenes: state.currentProject.scenes.map((scene) =>
              scene.id === sceneId ? { ...scene, ...updated } : scene
            ),
          }
        : null,
    }));
  },

  deleteScene: async (sceneId) => {
    const project = get().currentProject;
    if (!project) return;
    await sceneApi.deleteScene(project.id, sceneId);
    set((state) => ({
      currentProject: state.currentProject
        ? {
            ...state.currentProject,
            scenes: state.currentProject.scenes.filter((scene) => scene.id !== sceneId),
          }
        : null,
    }));
  },

  reorderScenes: async (orders) => {
    const project = get().currentProject;
    if (!project) return;
    await sceneApi.reorderScenes(project.id, orders);
    set((state) => {
      if (!state.currentProject) return state;
      const scenesMap = new Map(state.currentProject.scenes.map((scene) => [scene.id, scene]));
      const reordered = orders
        .map((order) => {
          const scene = scenesMap.get(order.scene_id);
          return scene ? { ...scene, sort_order: order.sort_order } : null;
        })
        .filter(Boolean) as Scene[];
      return { currentProject: { ...state.currentProject, scenes: reordered } };
    });
  },

  addShot: async (sceneId, data) => {
    const project = get().currentProject;
    if (!project) return;
    const shot = await shotApi.createShot(project.id, sceneId, data);
    set((state) => ({
      currentProject: state.currentProject
        ? {
            ...state.currentProject,
            scenes: state.currentProject.scenes.map((scene) =>
              scene.id === sceneId ? { ...scene, shots: [...scene.shots, shot] } : scene
            ),
          }
        : null,
    }));
  },

  updateShot: async (shotId, data) => {
    const project = get().currentProject;
    if (!project) return;
    const updated = await shotApi.updateShot(project.id, shotId, data);
    set((state) => ({
      currentProject: state.currentProject
        ? {
            ...state.currentProject,
            scenes: state.currentProject.scenes.map((scene) => ({
              ...scene,
              shots: scene.shots.map((shot) =>
                shot.id === shotId ? { ...shot, ...updated } : shot
              ),
            })),
          }
        : null,
    }));
  },

  deleteShot: async (shotId) => {
    const project = get().currentProject;
    if (!project) return;
    await shotApi.deleteShot(project.id, shotId);
    set((state) => ({
      currentProject: state.currentProject
        ? {
            ...state.currentProject,
            scenes: state.currentProject.scenes.map((scene) => ({
              ...scene,
              shots: scene.shots.filter((shot) => shot.id !== shotId),
            })),
          }
        : null,
    }));
  },

  reorderShots: async (orders) => {
    const project = get().currentProject;
    if (!project) return;
    await shotApi.reorderShots(project.id, orders);
    await get().fetchProject(project.id);
  },

  lockImage: async (shotId, imageId) => {
    const project = get().currentProject;
    if (!project) return;
    await shotApi.lockImage(project.id, shotId, imageId);
    set((state) => ({
      currentProject: state.currentProject
        ? {
            ...state.currentProject,
            scenes: state.currentProject.scenes.map((scene) => ({
              ...scene,
              shots: scene.shots.map((shot) => {
                if (shot.id !== shotId) return shot;
                return {
                  ...shot,
                  locked_image_id: imageId,
                  status: 'image_locked' as const,
                  images: shot.images.map((img) => ({
                    ...img,
                    is_locked: img.id === imageId,
                  })),
                };
              }),
            })),
          }
        : null,
    }));
  },

  setEditing: (editing) => set({ isEditing: editing }),
  setLockedBy: (user) => set({ lockedBy: user }),

  onTaskProgress: (data) => {
    set((state) => {
      if (!state.currentProject) return state;
      return {
        currentProject: {
          ...state.currentProject,
          scenes: state.currentProject.scenes.map((scene) => ({
            ...scene,
            shots: scene.shots.map((shot) => {
              if (shot.id !== data.shot_id) return shot;
              return { ...shot, status: data.status === 'running' ? shot.status : shot.status };
            }),
          })),
        },
      };
    });
  },

  onTaskCompleted: (data) => {
    set((state) => {
      if (!state.currentProject) return state;
      return {
        currentProject: {
          ...state.currentProject,
          scenes: state.currentProject.scenes.map((scene) => ({
            ...scene,
            shots: scene.shots.map((shot) => {
              if (shot.id !== data.shot_id) return shot;
              if (data.task_type === 'image') {
                const newImages: ShotImage[] = data.result_urls.map((url, index) => ({
                  id: Date.now() + index,
                  shot_id: shot.id,
                  image_url: url,
                  is_locked: false,
                  created_at: new Date().toISOString(),
                }));
                return { ...shot, status: 'images_generated' as const, images: [...shot.images, ...newImages] };
              }
              if (data.task_type === 'video') {
                return { ...shot, status: 'video_generated' as const, video_url: data.result_urls[0] };
              }
              if (data.task_type === 'audio') {
                return { ...shot, audio_url: data.result_urls[0] };
              }
              return shot;
            }),
          })),
        },
      };
    });
  },

  onLockChanged: (data) => {
    if (data.action === 'released' || data.action === 'force_released') {
      set({ lockedBy: null, isEditing: false });
    } else if (data.action === 'acquired' && data.locked_by) {
      set({ lockedBy: data.locked_by as User });
    }
  },
}));
