import { getLanguage } from 'obsidian';
import type { Locale, ShelfSettings } from './domain';
import { localizedText, resolveLocale, type TextKey } from './translations';

export { LocalizedError, localizedText } from './translations';
export type { TextKey } from './translations';

export function locale(settings: ShelfSettings): Locale {
  return resolveLocale(settings.language, getLanguage());
}

export function noteLocale(settings: ShelfSettings): Locale {
  return settings.noteLanguage === 'auto' ? locale(settings) : settings.noteLanguage;
}

export function text(
  settings: ShelfSettings,
  key: TextKey,
  values?: Record<string, string | number>,
): string {
  return localizedText(locale(settings), key, values);
}
