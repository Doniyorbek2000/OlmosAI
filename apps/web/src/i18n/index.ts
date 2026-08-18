'use client';

import { useEffect, useState } from 'react';
import en from './locales/en.json';
import uz from './locales/uz.json';
import ru from './locales/ru.json';

/**
 * Lightweight i18n scaffold (spec §61). Locales: English, Uzbek, Russian.
 * User-facing strings live in JSON dictionaries, never hardcoded across the app.
 * The active locale persists in localStorage; `t('nav.dashboard')` reads a
 * dotted key with an English fallback.
 */
export const LOCALES = { en, uz, ru } as const;
export type Locale = keyof typeof LOCALES;
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', uz: 'Oʻzbekcha', ru: 'Русский' };

const STORAGE_KEY = 'veyra_locale';

function lookup(dict: unknown, key: string): string | undefined {
  return key.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown> | undefined)?.[part], dict) as
    | string
    | undefined;
}

export function translate(locale: Locale, key: string): string {
  return lookup(LOCALES[locale], key) ?? lookup(LOCALES.en, key) ?? key;
}

export function getStoredLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v && v in LOCALES ? (v as Locale) : 'en';
}

export function setStoredLocale(locale: Locale): void {
  window.localStorage.setItem(STORAGE_KEY, locale);
  window.dispatchEvent(new Event('veyra-locale-change'));
}

/** Hook returning a `t()` bound to the active locale, reactive to changes. */
export function useTranslation() {
  const [locale, setLocale] = useState<Locale>('en');
  useEffect(() => {
    setLocale(getStoredLocale());
    const handler = () => setLocale(getStoredLocale());
    window.addEventListener('veyra-locale-change', handler);
    return () => window.removeEventListener('veyra-locale-change', handler);
  }, []);
  return {
    locale,
    setLocale: (l: Locale) => setStoredLocale(l),
    t: (key: string) => translate(locale, key),
  };
}
