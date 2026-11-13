import { App, Notice, PluginSettingTab, type SettingDefinitionItem } from 'obsidian';
import type GameShelf from './main';
import { DEFAULT_TEMPLATE, FIELD_GROUPS } from './domain';
import { message } from './notes';
import { parseSettings, validateMapping } from './note-format';

export class ShelfSettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    private shelf: GameShelf,
  ) {
    super(app, shelf);
  }
  getSettingDefinitions(): SettingDefinitionItem[] {
    const t = this.shelf.t.bind(this.shelf);
    const validate = (key: string) => (value: string) => {
      try {
        parseSettings({ ...this.shelf.settings, [key]: value });
      } catch (error) {
        return message(error);
      }
    };
    return [
      {
        name: t('folder'),
        desc: t('folderDesc'),
        control: { type: 'folder', key: 'folder', includeRoot: true, validate: validate('folder') },
      },
      {
        name: t('coverFolder'),
        control: { type: 'folder', key: 'coverFolder', validate: validate('coverFolder') },
      },
      {
        name: t('filename'),
        desc: t('filenameDesc'),
        control: { type: 'text', key: 'filename', validate: validate('filename') },
      },
      {
        name: t('language'),
        control: {
          type: 'dropdown',
          key: 'language',
          options: { auto: t('auto'), en: 'English', ja: '日本語' },
        },
      },
      { name: t('network'), desc: t('networkDesc'), control: { type: 'toggle', key: 'online' } },
      { name: t('saveCover'), control: { type: 'toggle', key: 'saveCover' } },
      ...FIELD_GROUPS.map((group) => ({
        name: t(group),
        desc: t('defaultFields'),
        control: { type: 'toggle' as const, key: `group:${group}` },
      })),
      {
        name: t('template'),
        desc: t('templateDesc'),
        control: { type: 'textarea', key: 'template', validate: validate('template') },
      },
      {
        name: t('resetTemplate'),
        action: () => {
          void this.shelf
            .updateSettings({ ...this.shelf.settings, template: DEFAULT_TEMPLATE })
            .then(() => this.update())
            .catch((error) => this.shelf.report(error));
        },
      },
      {
        name: t('mapping'),
        desc: t('mappingDesc'),
        control: {
          type: 'textarea',
          key: 'propertyNames',
          validate: (value) => {
            try {
              const parsed: unknown = JSON.parse(value);
              validateMapping(parsed);
            } catch (error) {
              return message(error);
            }
          },
        },
      },
      {
        name: t('status'),
        desc: t('statusesDesc'),
        control: {
          type: 'textarea',
          key: 'statuses',
          validate: (value) =>
            value.split('\n').some((s) => !s.trim() || s.trim().length > 40)
              ? 'Use one nonempty status per line, up to 40 characters.'
              : undefined,
        },
      },
      {
        name: t('clearCache'),
        action: () => {
          this.shelf.source.clearCache();
          new Notice(t('cacheCleared'));
        },
      },
    ];
  }
  getControlValue(key: string): unknown {
    if (key.startsWith('group:'))
      return this.shelf.settings.groups.some((group) => key === `group:${group}`);
    if (key === 'propertyNames') return JSON.stringify(this.shelf.settings.propertyNames, null, 2);
    if (key === 'statuses') return this.shelf.settings.statuses.join('\n');
    return Reflect.get(this.shelf.settings, key);
  }
  async setControlValue(key: string, value: unknown): Promise<void> {
    const settings = structuredClone(this.shelf.settings);
    if (key.startsWith('group:')) {
      const group = FIELD_GROUPS.find((group) => key === `group:${group}`);
      if (group)
        settings.groups = value
          ? [...new Set([...settings.groups, group])]
          : settings.groups.filter((g) => g !== group);
    } else if (key === 'propertyNames' && typeof value === 'string') {
      const parsed: unknown = JSON.parse(value);
      settings.propertyNames = validateMapping(parsed);
    } else if (key === 'statuses' && typeof value === 'string')
      settings.statuses = [...new Set(value.split('\n').map((s) => s.trim()))];
    else Reflect.set(settings, key, value);
    await this.shelf.updateSettings(settings);
    if (key === 'language') this.update();
  }
}
