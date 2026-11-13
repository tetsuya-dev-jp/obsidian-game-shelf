import { Notice, Plugin, TFile, debounce, requestUrl } from 'obsidian';
import type { Metadata, ShelfSettings } from './domain';
import { text, type TextKey } from './i18n';
import { parseSettings, record, isMetadataValue, validateMapping } from './note-format';
import { message, NoteStore } from './notes';
import { GameSource } from './source';
import { ShelfSettingsTab } from './settings';
import { ShelfView, VIEW_TYPE } from './view';

export default class GameShelf extends Plugin {
  settings: ShelfSettings = parseSettings(null);
  snapshots: Record<string, Metadata> = {};
  schemas: Record<string, Record<string, string>> = {};
  source!: GameSource;
  notes!: NoteStore;
  private stopped = false;
  private saving: Promise<void> = Promise.resolve();

  async onload(): Promise<void> {
    const saved: unknown = await this.loadData();
    if (record(saved)) {
      try {
        this.settings = parseSettings(saved.settings);
      } catch (error) {
        new Notice(`Game Shelf: ${message(error)}`);
      }
      if (record(saved.snapshots))
        for (const [id, value] of Object.entries(saved.snapshots)) {
          if (!/^(gnd:|manual:)/.test(id)) continue;
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
          if (!/^(gnd:|manual:)/.test(id)) continue;
          try {
            this.schemas[id] = validateMapping(value);
          } catch (error) {
            new Notice(`Game Shelf: ${message(error)}`);
          }
        }
    }
    this.source = new GameSource(async (url) => {
      if (!this.settings.online || this.stopped) throw new Error(this.t('offline'));
      const response = await this.request(url);
      return { status: response.status, text: response.text };
    });
    this.notes = new NoteStore({
      app: this.app,
      settings: () => this.settings,
      snapshots: this.snapshots,
      schemas: this.schemas,
      save: () => this.persist(),
      download: async (url) => {
        if (!this.settings.online || this.stopped) throw new Error(this.t('offline'));
        const response = await this.request(url);
        if (response.status !== 200)
          throw new Error(`Cover request failed: HTTP ${response.status}`);
        return response.arrayBuffer;
      },
    });
    this.registerView(VIEW_TYPE, (leaf) => new ShelfView(leaf, this));
    this.addSettingTab(new ShelfSettingsTab(this.app, this));
    this.addRibbonIcon('library', 'Game Shelf', () => {
      void this.openShelf('library').catch((error) => this.report(error));
    });
    this.addCommand({
      id: 'open-library',
      name: 'Open library',
      callback: () => {
        void this.openShelf('library').catch((error) => this.report(error));
      },
    });
    this.addCommand({
      id: 'find-game',
      name: 'Find and add a game',
      callback: () => {
        void this.openShelf('discover').catch((error) => this.report(error));
      },
    });
    this.addCommand({
      id: 'add-manually',
      name: 'Add a game manually',
      callback: () => {
        void this.openShelf('library')
          .then((view) => view.openManual())
          .catch((error) => this.report(error));
      },
    });
    this.addCommand({
      id: 'log-session',
      name: 'Log a play session',
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
  onunload(): void {
    this.stopped = true;
  }
  t(key: TextKey): string {
    return text(this.settings, key);
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
    new Notice(`Game Shelf: ${message(error)}`, 8000);
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
    this.settings = parseSettings(settings);
    this.notes.resetIndex();
    await this.persist();
    this.refreshViews();
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
    if (!(leaf.view instanceof ShelfView)) throw new Error('Game Shelf view did not load.');
    leaf.view.setTab(tab);
    return leaf.view;
  }
  private async request(url: string) {
    let timer = 0;
    const timeout = new Promise<never>((_, reject) => {
      timer = window.setTimeout(
        () => reject(new Error('The request timed out. Try again or add the game manually.')),
        20000,
      );
    });
    try {
      return await Promise.race([
        requestUrl({
          url,
          method: 'GET',
          headers: {
            'Accept-Language': 'ja',
            'User-Agent': 'GameShelf/1.0 (+https://github.com/tetsuya-dev-jp/obsidian-game-shelf)',
          },
          throw: false,
        }),
        timeout,
      ]);
    } finally {
      window.clearTimeout(timer);
    }
  }
}
