import { create } from 'zustand';
import type { SystemSetting } from '@/types/settings';
import * as settingsApi from '@/api/settings';

interface SettingsState {
  settings: SystemSetting[];
  loading: boolean;

  fetchSettings: () => Promise<void>;
  updateSettings: (items: { key: string; value: string | number }[]) => Promise<void>;
  getSettingValue: (key: string) => string | number | undefined;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: [],
  loading: false,

  fetchSettings: async () => {
    set({ loading: true });
    try {
      const result = await settingsApi.getSettings();
      set({ settings: result.items, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  updateSettings: async (items) => {
    set({ loading: true });
    try {
      await settingsApi.updateSettings({ settings: items });
      set((state) => {
        const updatedSettings = [...state.settings];
        for (const item of items) {
          const index = updatedSettings.findIndex((s) => s.key === item.key);
          if (index >= 0) {
            updatedSettings[index] = { ...updatedSettings[index], value: item.value };
          }
        }
        return { settings: updatedSettings, loading: false };
      });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  getSettingValue: (key) => {
    const setting = get().settings.find((s) => s.key === key);
    return setting?.value;
  },
}));
