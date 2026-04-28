import { create } from 'zustand';
import zh from '@/locales/zh';
import en from '@/locales/en';
import type { Locale } from '@/locales/zh';

type LangKey = 'zh' | 'en';

interface LocaleState {
  lang: LangKey;
  messages: Locale;
  setLang: (lang: LangKey) => void;
  toggleLang: () => void;
}

const LANG_STORAGE_KEY = 'ci-ai-lang';

function getInitialLang(): LangKey {
  const stored = localStorage.getItem(LANG_STORAGE_KEY);
  if (stored === 'en' || stored === 'zh') return stored;
  return 'zh'; // 默认中文
}

const localeMap: Record<LangKey, Locale> = { zh, en };

export const useLocaleStore = create<LocaleState>((set) => {
  const initialLang = getInitialLang();
  return {
    lang: initialLang,
    messages: localeMap[initialLang],

    setLang: (lang) => {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
      set({ lang, messages: localeMap[lang] });
    },

    toggleLang: () => {
      set((state) => {
        const newLang: LangKey = state.lang === 'zh' ? 'en' : 'zh';
        localStorage.setItem(LANG_STORAGE_KEY, newLang);
        return { lang: newLang, messages: localeMap[newLang] };
      });
    },
  };
});
