import { Notice, Plugin, TFile, debounce, requestUrl } from 'obsidian';
import type { Metadata, ShelfSettings, Provider } from './domain';
import { text, noteLocale, locale, LocalizedError, type TextKey } from './i18n';
import { parseSettings, record, isMetadataValue, validateMapping } from './note-format';
import { message, NoteStore } from './notes';
import { GameSource } from './source';
import { IgdbSource, type IgdbRequest } from './igdb';
import { IgdbSetupModal, ShelfSettingsTab } from './settings';
import { ShelfView, VIEW_TYPE } from './view';

export default class GameShelf extends Plugin {
  settings: ShelfSettings = parseSettings(null);
  snapshots: Record<string, Metadata> = {};
  schemas: Record<string, Record<string, string>> = {};
  source!: GameSource;
  igdb!: IgdbSource;
  notes!: NoteStore;
  private stopped = false;
  private saving: Promise<void> = Promise.resolve();

  async onload(): Promise<void> {
    const saved: unknown = await this.loadData();
    if (record(saved)) {
      try {
        this.settings = parseSettings(saved.settings);
      } catch (error) {
        this.report(error);
      }
      if (record(saved.snapshots))
        for (const [id, value] of Object.entries(saved.snapshots)) {
          if (!/^(gnd:|igdb:|manual:)/.test(id)) continue;
          if (record(value) && Object.values(value).every(isMetadataValue))
            this.snapshots[id] = Object.fromEntries(
              Object.entries(value).filter(
                (entry): entry is [string, import('./domain').MetadataValue] =>
                  isMetadataValue(entry[1]),
              ),
            );
        }
      if (record(saved.schemas))
        for (const [id, value] of Object.entries(saved.schemas)) {
          if (!/^(gnd:|igdb:|manual:)/.test(id)) continue;
          try {
            this.schemas[id] = validateMapping(value);
          } catch (error) {
            this.report(error);
          }
        }
    }
    this.source = new GameSource(async (url) => {
      if (!this.settings.online || this.stopped) throw new LocalizedError('offline');
      const response = await this.request(url);
      return { status: response.status, text: response.text };
    });
    this.igdb = new IgdbSource(
      async (request) => {
        if (!this.settings.online || this.stopped) throw new LocalizedError('offline');
        const response = await this.request(request.url, request);
        return { status: response.status, text: response.text };
      },
      () => ({
        clientId: this.settings.igdbClientId,
        clientSecret: this.settings.igdbClientSecret
          ? this.app.secretStorage.getSecret(this.settings.igdbClientSecret) ?? ''
          : '',
      }),
    );
    this.notes = new NoteStore({
      app: this.app,
      settings: () => this.settings,
      snapshots: this.snapshots,
      schemas: this.schemas,
      save: () => this.persist(),
      download: async (url) => {
        if (!this.settings.online || this.stopped) throw new LocalizedError('offline');
        const response = await this.request(url);
        if (response.status !== 200)
          throw new LocalizedError('coverHttp', { status: response.status });
        return response.arrayBuffer;
      },
    });
    this.registerView(VIEW_TYPE, (leaf) => new ShelfView(leaf, this));
    this.addSettingTab(new ShelfSettingsTab(this.app, this));
    this.addRibbonIcon('library', 'Game Shelf', () => {
      void this.openShelf('library').catch((error) => this.report(error));
    });
    this.registerCommands();
    const update = debounce(() => this.refreshViews(), 200, true);
    this.registerEvent(
      this.app.metadataCache.on('changed', (file) => {
        this.notes.updateIndex(file);
        update();
      }),
    );
    this.registerEvent(
      this.app.vault.on('delete', (file) => {
        this.notes.removeIndex(file.path);
        update();
      }),
    );
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        this.notes.removeIndex(oldPath);
        if (file instanceof TFile) this.notes.updateIndex(file);
        update();
      }),
    );
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (!(file instanceof TFile) || !this.notes.list().some((item) => item.path === file.path))
          return;
        menu.addItem((item) =>
          item
            .setTitle(this.t('showDetails'))
            .setIcon('gamepad-2')
            .onClick(() => {
              void this.openShelf('library')
                .then((view) => view.selectLibrary(file.path))
                .catch((error) => this.report(error));
            }),
        );
      }),
    );
  }
  private registerCommands(): void {
    for (const id of ['open-library', 'find-game', 'add-manually', 'log-session'])
      this.removeCommand(id);
    this.addCommand({
      id: 'open-library',
      name: this.t('openLibraryCommand'),
      callback: () => {
        void this.openShelf('library').catch((error) => this.report(error));
      },
    });
    this.addCommand({
      id: 'find-game',
      name: this.t('findGameCommand'),
      callback: () => {
        void this.openShelf('discover').catch((error) => this.report(error));
      },
    });
    this.addCommand({
      id: 'add-manually',
      name: this.t('manualCommand'),
      callback: () => {
        void this.openShelf('library')
          .then((view) => view.openManual())
          .catch((error) => this.report(error));
      },
    });
    this.addCommand({
      id: 'log-session',
      name: this.t('logSessionCommand'),
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const item = file ? this.notes.list().find((note) => note.path === file.path) : null;
        if (!item) return false;
        if (!checking)
          void this.openShelf('library')
            .then((view) => view.selectLibrary(item.path, true))
            .catch((error) => this.report(error));
        return true;
      },
    });
  }
  onunload(): void {
    this.stopped = true;
  }
  t(key: TextKey, values?: Record<string, string | number>): string {
    return text(this.settings, key, values);
  }
  selectedProvider(): Provider {
    return this.settings.provider === 'auto'
      ? noteLocale(this.settings) === 'ja' ? 'gamesneverdie' : 'igdb'
      : this.settings.provider;
  }
  sourceFor(provider: Provider): GameSource | IgdbSource {
    return provider === 'igdb' ? this.igdb : this.source;
  }
  clearCaches(): void {
    this.source.clearCache();
    this.igdb.clearCache();
  }
  hasIgdbCredentials(): boolean {
    return Boolean(this.settings.igdbClientId.trim() && this.settings.igdbClientSecret &&
      this.app.secretStorage.getSecret(this.settings.igdbClientSecret)?.trim());
  }
  openIgdbSetup(): void {
    new IgdbSetupModal(this.app, this).open();
  }
  async testIgdbConnection(): Promise<void> {
    if (!this.settings.online) throw new LocalizedError('offline');
    await this.igdb.testConnection();
    new Notice(this.t('igdbConnected'));
  }
  statusLabel(status: string): string {
    switch (status) {
      case 'backlog':
      case 'playing':
      case 'completed':
      case 'paused':
      case 'dropped':
      case 'wishlist':
        return this.t(status);
      default:
        return status;
    }
  }
  report(error: unknown): void {
    new Notice(`Game Shelf: ${message(error, this.settings)}`, 8000);
  }
  async persist(): Promise<void> {
    const payload = {
      settings: structuredClone(this.settings),
      snapshots: structuredClone(this.snapshots),
      schemas: structuredClone(this.schemas),
    };
    const next = this.saving.catch(() => undefined).then(() => this.saveData(payload));
    this.saving = next;
    await next;
  }
  async updateSettings(settings: ShelfSettings): Promise<void> {
    const previousProvider = this.selectedProvider();
    const previousLanguage = locale(this.settings);
    const previousId = this.settings.igdbClientId;
    const previousSecret = this.settings.igdbClientSecret;
    this.settings = parseSettings(settings);
    if (locale(this.settings) !== previousLanguage) this.registerCommands();
    this.notes.resetIndex();
    await this.persist();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE))
      if (leaf.view instanceof ShelfView)
        leaf.view.settingsChanged(previousProvider !== this.selectedProvider() ||
          previousId !== this.settings.igdbClientId || previousSecret !== this.settings.igdbClientSecret);
  }
  refreshViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE))
      if (leaf.view instanceof ShelfView) leaf.view.refreshLibrary();
  }
  async openShelf(tab: 'library' | 'discover'): Promise<ShelfView> {
    await new Promise<void>((resolve) => this.app.workspace.onLayoutReady(() => resolve()));
    const leaf =
      this.app.workspace.getLeavesOfType(VIEW_TYPE)[0] ?? this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    if (!(leaf.view instanceof ShelfView)) throw new LocalizedError('viewUnavailable');
    leaf.view.setTab(tab);
    return leaf.view;
  }
  private async request(url: string, options?: IgdbRequest) {
    let timer = 0;
    const timeout = new Promise<never>((_, reject) => {
      timer = window.setTimeout(
        () => reject(new LocalizedError('requestTimeout')),
        20000,
      );
    });
    try {
      return await Promise.race([
        requestUrl({
          url,
          method: options?.method ?? 'GET',
          headers: options?.headers ?? {
            'Accept-Language': 'ja',
            'User-Agent': 'GameShelf/1.0 (+https://github.com/tetsuya-dev-jp/obsidian-game-shelf)',
          },
          body: options?.body,
          throw: false,
        }),
        timeout,
      ]);
    } finally {
      window.clearTimeout(timer);
    }
  }
}
