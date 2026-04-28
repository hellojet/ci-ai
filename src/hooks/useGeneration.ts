import { useCallback } from 'react';
import { useGenerationStore } from '@/stores/generationStore';
import { useAuthStore } from '@/stores/authStore';
import { IMAGE_CREDITS_COST, VIDEO_CREDITS_COST } from '@/utils/constants';
import { message } from 'antd';
import type { TaskType } from '@/types/generation';

export function useGeneration(projectId: number | null) {
  const { generateForShot, generateAll, retryTask } = useGenerationStore();
  const { user } = useAuthStore();

  const checkCredits = useCallback(
    (taskType: TaskType, count: number = 1) => {
      if (!user) return false;
      const cost = taskType === 'image' ? IMAGE_CREDITS_COST * count : taskType === 'video' ? VIDEO_CREDITS_COST * count : 0;
      if (user.credits < cost) {
        message.error(`Insufficient credits. Need ${cost}, have ${user.credits}`);
        return false;
      }
      return true;
    },
    [user]
  );

  const handleGenerateForShot = useCallback(
    async (shotId: number, taskType: TaskType) => {
      if (!projectId) return;
      if (!checkCredits(taskType)) return;
      try {
        await generateForShot(projectId, shotId, taskType);
        message.success(`${taskType} generation started`);
      } catch (error) {
        message.error((error as Error).message || 'Generation failed');
      }
    },
    [projectId, checkCredits, generateForShot]
  );

  const handleGenerateAll = useCallback(
    async (taskType: TaskType) => {
      if (!projectId) return;
      try {
        await generateAll(projectId, taskType);
        message.success(`Batch ${taskType} generation started`);
      } catch (error) {
        message.error((error as Error).message || 'Batch generation failed');
      }
    },
    [projectId, generateAll]
  );

  const handleRetry = useCallback(
    async (taskId: number) => {
      if (!projectId) return;
      try {
        await retryTask(projectId, taskId);
        message.success('Retry started');
      } catch (error) {
        message.error((error as Error).message || 'Retry failed');
      }
    },
    [projectId, retryTask]
  );

  return {
    generateForShot: handleGenerateForShot,
    generateAll: handleGenerateAll,
    retryTask: handleRetry,
    checkCredits,
  };
}
