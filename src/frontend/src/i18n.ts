import { writable } from 'svelte/store';

export type Locale = 'en' | 'pt-BR';

import en from './locales/en';
import ptBR from './locales/pt-BR';

const messages: Record<Locale, Record<string, string>> = { en, 'pt-BR': ptBR };

export function resolveLocale(language?: string | null): Locale {
  return language?.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en';
}

export function translate(locale: Locale, message: string, values: Record<string, string | number> = {}): string {
  let translated = messages[locale][message] ?? message;
  for (const [key, value] of Object.entries(values)) translated = translated.replace(`{${key}}`, String(value));
  return translated;
}

function initialLocale(): Locale {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('tomorrow.locale');
    if (saved === 'en' || saved === 'pt-BR') return saved;
  }
  return resolveLocale(typeof navigator === 'undefined' ? undefined : navigator.language);
}

export const locale = writable<Locale>(initialLocale());
