import { useLocaleStore } from '@/stores/localeStore';
import type { Locale } from '@/locales/zh';

type NestedKeyOf<T> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends object
        ? `${K}.${NestedKeyOf<T[K]>}`
        : K;
    }[keyof T & string]
  : never;

type LocaleKey = NestedKeyOf<Locale>;

/**
 * 国际化 hook，提供 t() 翻译函数。
 *
 * 用法：
 *   const { t, lang, toggleLang } = useLocale();
 *   t('login.signIn')               // => '登录' | 'Sign In'
 *   t('admin.creditModalTitle', { username: 'admin' }) // => '管理积分 — admin'
 */
export function useLocale() {
  const { lang, messages, toggleLang, setLang } = useLocaleStore();

  function t(key: string, params?: Record<string, string | number>): string {
    const parts = key.split('.');
    let value: unknown = messages;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        return key; // fallback: 返回 key 本身
      }
    }

    if (typeof value !== 'string') return key;

    if (params) {
      return value.replace(/\{(\w+)\}/g, (_, paramKey) =>
        params[paramKey] !== undefined ? String(params[paramKey]) : `{${paramKey}}`
      );
    }

    return value;
  }

  return { t, lang, toggleLang, setLang };
}
