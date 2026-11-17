import { describe, expect, it } from 'vitest';
import { en, ja, LocalizedError, localizedText, resolveLocale } from '../src/translations';

const placeholders = (value: string): string[] =>
  [...value.matchAll(/(?<!\{)\{([a-zA-Z][a-zA-Z0-9_]*)\}(?!\})/g)]
    .map((match) => match[1]!)
    .sort();

describe('translations', () => {
  it('keeps matching keys and interpolation placeholders in both languages', () => {
    expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(ja[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it('resolves automatic language from Obsidian and preserves explicit choices', () => {
    expect(resolveLocale('auto', 'ja-JP')).toBe('ja');
    expect(resolveLocale('auto', 'en-US')).toBe('en');
    expect(resolveLocale('en', 'ja-JP')).toBe('en');
    expect(resolveLocale('ja', 'en-US')).toBe('ja');
  });

  it('interpolates named values and leaves template tokens intact', () => {
    expect(localizedText('en', 'trailerLabel', { number: 2 })).toBe('Trailer 2');
    expect(localizedText('en', 'playersLabel', { count: 7 })).toBe('7 players');
    expect(localizedText('ja', 'invalidProperty', { key: 'bad name' }))
      .toBe('無効なプロパティ名です：bad name');
    expect(localizedText('en', 'templateDesc')).toContain('{{title}}');
    expect(new LocalizedError('folderBlocked', { path: 'Games' }).message)
      .toBe('A file blocks the folder: Games');
  });
});
