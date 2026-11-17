import { App, Modal, Notice, PluginSettingTab, SecretComponent, Setting, type SettingDefinitionItem } from 'obsidian';
import type GameShelf from './main';
import { DEFAULT_TEMPLATE, FIELD_GROUPS } from './domain';
import { message } from './notes';
import { parseSettings, validateMapping } from './note-format';

export class IgdbSetupModal extends Modal {
  constructor(app: App, private shelf: GameShelf) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass('gs-igdb-setup');
    const t = this.shelf.t.bind(this.shelf);
    this.titleEl.setText(t('igdbGuide'));
    this.contentEl.empty();
    this.contentEl.createEl('p', { text: t('igdbGuideIntro') });
    for (const key of [
      'igdbGuideStep1', 'igdbGuideStep2', 'igdbGuideStep3', 'igdbGuideStep4',
    ] as const) this.contentEl.createEl('p', { text: t(key) });
    for (const [key, href] of [
      ['igdbGuideDocs', 'https://api-docs.igdb.com/#getting-started'],
      ['igdbGuideConsole', 'https://dev.twitch.tv/console/apps'],
    ] as const) {
      this.contentEl.createEl('p').createEl('a', {
        text: t(key), href, attr: { target: '_blank', rel: 'noopener noreferrer' },
      });
    }
    new Setting(this.contentEl).setName(t('igdbClientId')).setDesc(t('igdbClientIdDesc'))
      .addText((input) => input.setValue(this.shelf.settings.igdbClientId).onChange((value) => {
        void this.shelf.updateSettings({ ...this.shelf.settings, igdbClientId: value })
          .catch((error: unknown) => this.shelf.report(error));
      }));
    const secretRow = new Setting(this.contentEl)
      .setName(t('igdbClientSecret')).setDesc(t('igdbClientSecretDesc'));
    secretRow.addComponent((el) => new SecretComponent(this.app, el)
      .setValue(this.shelf.settings.igdbClientSecret)
      .onChange((value) => {
        void this.shelf.updateSettings({ ...this.shelf.settings, igdbClientSecret: value ?? '' })
          .catch((error: unknown) => this.shelf.report(error));
      }));
    new Setting(this.contentEl).setName(t('network')).setDesc(t('networkDesc'))
      .addToggle((toggle) => toggle.setValue(this.shelf.settings.online).onChange((value) => {
        void this.shelf.updateSettings({ ...this.shelf.settings, online: value })
          .catch((error: unknown) => this.shelf.report(error));
      }));
    new Setting(this.contentEl).setName(t('igdbTest')).addButton((button) =>
      button.setButtonText(t('igdbTest')).onClick(() => {
        void this.shelf.testIgdbConnection().catch((error: unknown) => this.shelf.report(error));
      }),
    );
    this.contentEl.createEl('p', { text: t('igdbGuideStep5') });
    this.contentEl.createEl('p', { text: t('igdbGuidePrivacy') });
  }
}

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
        return message(error, this.shelf.settings);
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
      {
        name: t('noteLanguage'),
        desc: t('noteLanguageDesc'),
        control: {
          type: 'dropdown',
          key: 'noteLanguage',
          options: { auto: t('matchInterface'), en: t('languageEn'), ja: t('languageJa') },
        },
      },
      {
        name: t('provider'),
        desc: t('providerDesc'),
        control: {
          type: 'dropdown',
          key: 'provider',
          options: { auto: t('providerAuto'), gamesneverdie: t('providerGnd'), igdb: t('providerIgdb') },
        },
      },
      { name: t('network'), desc: t('networkDesc'), control: { type: 'toggle', key: 'online' } },
      {
        name: t('igdbClientId'),
        desc: t('igdbClientIdDesc'),
        control: { type: 'text', key: 'igdbClientId' },
      },
      {
        name: t('igdbClientSecret'),
        desc: t('igdbClientSecretDesc'),
        control: { type: 'secret', key: 'igdbClientSecret' },
      },
      {
        name: t('igdbGuide'),
        action: () => new IgdbSetupModal(this.app, this.shelf).open(),
      },
      {
        name: t('igdbTest'),
        action: () => {
          void this.shelf.testIgdbConnection().catch((error: unknown) => this.shelf.report(error));
        },
      },
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
              return message(error, this.shelf.settings);
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
              ? t('invalidStatusLine')
              : undefined,
        },
      },
      {
        name: t('clearCache'),
        action: () => {
          this.shelf.clearCaches();
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
