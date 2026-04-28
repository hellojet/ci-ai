import { create } from 'zustand';
import type { Character } from '@/types/character';
import type { Environment } from '@/types/environment';
import type { Style } from '@/types/style';
import * as characterApi from '@/api/characters';
import * as environmentApi from '@/api/environments';
import * as styleApi from '@/api/styles';

interface AssetState {
  characters: Character[];
  environments: Environment[];
  styles: Style[];
  charactersTotal: number;
  environmentsTotal: number;
  stylesTotal: number;
  loading: boolean;

  fetchCharacters: (params?: { page?: number; page_size?: number; keyword?: string }) => Promise<void>;
  fetchEnvironments: (params?: { page?: number; page_size?: number; keyword?: string }) => Promise<void>;
  fetchStyles: (params?: { page?: number; page_size?: number }) => Promise<void>;
}

export const useAssetStore = create<AssetState>((set) => ({
  characters: [],
  environments: [],
  styles: [],
  charactersTotal: 0,
  environmentsTotal: 0,
  stylesTotal: 0,
  loading: false,

  fetchCharacters: async (params) => {
    set({ loading: true });
    try {
      const result = await characterApi.getCharacters(params);
      set({ characters: result.items, charactersTotal: result.total, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchEnvironments: async (params) => {
    set({ loading: true });
    try {
      const result = await environmentApi.getEnvironments(params);
      set({ environments: result.items, environmentsTotal: result.total, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchStyles: async (params) => {
    set({ loading: true });
    try {
      const result = await styleApi.getStyles(params);
      set({ styles: result.items, stylesTotal: result.total, loading: false });
    } catch {
      set({ loading: false });
    }
  },
}));
