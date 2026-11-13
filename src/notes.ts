import { App, TFile, TFolder, getFrontMatterInfo, normalizePath } from 'obsidian';
import type {
  FieldGroup,
  Game,
  LibraryItem,
  Metadata,
  MetadataValue,
  ShelfSettings,
} from './domain';
import { text } from './i18n';
import {
  JOURNAL_MARKER,
  PERSONAL_KEYS,
  appendSession,
  changesFor,
  filename,
  libraryItem,
  markdownText,
  patchProperties,
  property,
  record,
  renderBody,
  renderNote,
  sourceBody,
  sourceMetadata,
  vaultPath,
  type MetadataChange,
} from './note-format';

export interface CreateOptions {
  title: string;
  status: string;
  rating: number | null;
  ownership: string;
  groups: FieldGroup[];
  saveCover: boolean;
}
export interface CreateResult {
  file: TFile;
  existing: boolean;
  warning: string | null;
}
export interface NoteContext {
  app: App;
  settings: () => ShelfSettings;
  snapshots: Record<string, Metadata>;
  schemas: Record<string, Record<string, string>>;
  save: () => Promise<void>;
  download: (url: string) => Promise<ArrayBuffer>;
}

export class NoteStore {
  private pending = new Map<string, Promise<CreateResult>>();
  private created = new Map<string, TFile>();
  private index: Map<string, LibraryItem> | null = null;
  private idFields: Set<string> | null = null;
  constructor(private context: NoteContext) {}
  private get settings(): ShelfSettings {
    return this.context.settings();
  }
  private get app(): App {
    return this.context.app;
  }
  private schema(properties: Record<string, unknown>): ShelfSettings {
    const fields = (this.idFields ??= new Set([
      property(this.settings, 'game_id'),
      'game_id',
      ...Object.values(this.context.schemas).map((schema) => schema.game_id ?? 'game_id'),
    ]));
    for (const field of fields) {
      const id = properties[field];
      if (typeof id === 'string' && /^(gnd:|manual:)/.test(id))
        return {
          ...this.settings,
          propertyNames:
            this.context.schemas[id] ??
            (field === property(this.settings, 'game_id') ? this.settings.propertyNames : {}),
        };
    }
    return this.settings;
  }
  settingsFor(file: TFile): ShelfSettings {
    const fm: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter;
    return record(fm) ? this.schema(fm) : this.settings;
  }

  list(): LibraryItem[] {
    if (!this.index) {
      this.index = new Map();
      for (const file of this.app.vault.getMarkdownFiles()) this.updateIndex(file);
    }
    return [...this.index.values()];
  }
  resetIndex(): void {
    this.index = null;
    this.idFields = null;
  }
  removeIndex(path: string): void {
    this.index?.delete(path);
  }
  updateIndex(file: TFile): void {
    if (!this.index) return;
    const fm: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const item = record(fm) ? libraryItem(file.path, file.stat.mtime, fm, this.schema(fm)) : null;
    if (item) this.index.set(file.path, item);
    else this.index.delete(file.path);
  }
  find(id: string): TFile | null {
    const created = this.created.get(id);
    if (created && this.app.vault.getAbstractFileByPath(created.path) === created) return created;
    const path = this.list().find((item) => item.id === id)?.path;
    const file = path ? this.app.vault.getAbstractFileByPath(path) : null;
    return file instanceof TFile ? file : null;
  }
  file(path: string): TFile {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile))
      throw new Error('The note no longer exists. Reopen your library.');
    return file;
  }
  async open(file: TFile): Promise<void> {
    await this.app.workspace.getLeaf(false).openFile(file);
  }
  create(game: Game, options: CreateOptions): Promise<CreateResult> {
    const id = `gnd:${game.slug}`;
    const pending = this.pending.get(id);
    if (pending) return pending;
    const promise = this.createFromGame(game, options).finally(() => this.pending.delete(id));
    this.pending.set(id, promise);
    return promise;
  }
  private async folder(path: string): Promise<void> {
    if (!path) return;
    const parts = path.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const current = parts.slice(0, i).join('/');
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing instanceof TFolder) continue;
      if (existing) throw new Error(`A file blocks the folder: ${current}`);
      try {
        await this.app.vault.createFolder(current);
      } catch (error) {
        if (!(this.app.vault.getAbstractFileByPath(current) instanceof TFolder)) throw error;
      }
    }
  }
  private async cover(game: Game): Promise<string | null> {
    if (!game.cover_url) return null;
    const url = new URL(game.cover_url);
    if (url.protocol !== 'https:' || url.hostname !== 'media.gamesneverdie.com')
      throw new Error('Unexpected cover host.');
    const binary = await this.context.download(url.href);
    if (binary.byteLength > 3 * 1024 * 1024) throw new Error('The cover exceeds 3 MiB.');
    const bytes = new Uint8Array(binary);
    const signature = (start: number, end: number) =>
      String.fromCharCode(...bytes.slice(start, end));
    const extension =
      signature(0, 4) === 'RIFF' && signature(8, 12) === 'WEBP'
        ? 'webp'
        : bytes[0] === 0x89 && signature(1, 4) === 'PNG'
          ? 'png'
          : bytes[0] === 0xff && bytes[1] === 0xd8
            ? 'jpg'
            : null;
    if (!extension) throw new Error('The cover response is not a supported image.');
    const dir = vaultPath(this.settings.coverFolder);
    await this.folder(dir);
    const path = normalizePath(`${dir}/gnd-${game.slug}.${extension}`);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) return path;
    if (existing) throw new Error('A folder blocks the cover filename.');
    await this.app.vault.createBinary(path, binary);
    return path;
  }
  private async write(
    title: string,
    game: Pick<Game, 'title' | 'slug' | 'release_date' | 'platforms'>,
    metadata: Metadata,
    body: string,
  ): Promise<TFile> {
    const dir = vaultPath(this.settings.folder, true);
    await this.folder(dir);
    const name = filename(this.settings.filename, { ...game, title });
    const edition = filename('{{title}}', {
      ...game,
      title:
        [game.release_date?.match(/^\d{4}/)?.[0], game.platforms[0]].filter(Boolean).join(' ') ||
        'Edition',
    });
    for (let i = 0; i < 100; i++) {
      const suffix = i ? ` (${edition}${i > 1 ? ` ${i}` : ''})` : '';
      const path = normalizePath(`${dir ? dir + '/' : ''}${name}${suffix}.md`);
      if (this.app.vault.getAbstractFileByPath(path)) continue;
      try {
        return await this.app.vault.create(path, renderNote(metadata, body));
      } catch (error) {
        if (!this.app.vault.getAbstractFileByPath(path)) throw error;
      }
    }
    throw new Error('Too many notes share that filename. Choose another filename template.');
  }
  private personal(options: CreateOptions): Metadata {
    if (!options.title.trim()) throw new Error(text(this.settings, 'invalidTitle'));
    if (!options.status.trim()) throw new Error('Choose a play status.');
    if (
      options.rating !== null &&
      (!Number.isFinite(options.rating) || options.rating < 0 || options.rating > 5)
    )
      throw new Error('Rating must be between 0 and 5.');
    return Object.fromEntries(
      Object.entries({
        status: options.status,
        rating: options.rating,
        ownership: options.ownership,
        started: options.status === 'playing' ? localDate() : null,
        finished: options.status === 'completed' ? localDate() : null,
        playtime_minutes: 0,
        tags: ['games'],
      }).map(([key, value]) => [property(this.settings, key), value]),
    );
  }
  private async createFromGame(game: Game, options: CreateOptions): Promise<CreateResult> {
    const id = `gnd:${game.slug}`;
    const existing = this.find(id);
    if (existing) return { file: existing, existing: true, warning: null };
    const personal = this.personal(options);
    const imported = sourceMetadata(game, options.groups, this.settings);
    let cover: string | null = game.cover_url;
    let warning: string | null = null;
    if (options.saveCover && game.cover_url) {
      try {
        cover = await this.cover(game);
      } catch (error) {
        warning = `Cover was not saved offline: ${message(error)}`;
      }
    }
    const metadata = {
      ...imported,
      ...personal,
      cssclasses: ['game-shelf-note'],
      [property(this.settings, 'title')]: options.title.trim(),
      [property(this.settings, 'cover')]: cover,
    };
    const body = this.body(
      options.title,
      cover,
      sourceBody(game, options.groups, text(this.settings, 'sourceHeading')),
    );
    const file = await this.write(options.title, game, metadata, body);
    this.created.set(id, file);
    this.context.schemas[id] = { ...this.settings.propertyNames };
    this.context.snapshots[id] = imported;
    try {
      await this.context.save();
    } catch (error) {
      warning = `Note created, but import history could not be saved: ${message(error)}`;
    }
    return { file, existing: false, warning };
  }
  async manual(options: CreateOptions): Promise<CreateResult> {
    const id = `manual:${crypto.randomUUID()}`;
    const metadata: Metadata = {
      ...this.personal(options),
      cssclasses: ['game-shelf-note'],
      [property(this.settings, 'game_id')]: id,
      [property(this.settings, 'game_source')]: 'manual',
      [property(this.settings, 'title')]: options.title.trim(),
    };
    const file = await this.write(
      options.title,
      { title: options.title, slug: id.replace(':', '-'), release_date: null, platforms: [] },
      metadata,
      this.body(options.title, null, ''),
    );
    this.created.set(id, file);
    this.context.schemas[id] = { ...this.settings.propertyNames };
    let warning: string | null = null;
    try {
      await this.context.save();
    } catch (error) {
      warning = `Note created, but its property-name profile could not be saved: ${message(error)}`;
    }
    return { file, existing: false, warning };
  }
  body(title: string, cover: string | null, source: string): string {
    const image = cover
      ? cover.startsWith('https://')
        ? `![Cover](<${cover}>)`
        : `![[${cover}]]`
      : '';
    return renderBody(this.settings.template, {
      title: markdownText(title),
      cover: image,
      source,
      notes_heading: text(this.settings, 'notesHeading'),
      journal_heading: text(this.settings, 'journalHeading'),
      journal_marker: JOURNAL_MARKER,
    });
  }
  async setPersonal(
    file: TFile,
    key: (typeof PERSONAL_KEYS)[number],
    value: MetadataValue,
  ): Promise<void> {
    const settings = this.settingsFor(file);
    const name = property(settings, key);
    if (
      key === 'rating' &&
      value !== null &&
      (typeof value !== 'number' || value < 0 || value > 5 || !Number.isFinite(value))
    )
      throw new Error('Rating must be between 0 and 5.');
    if (key === 'status' && (typeof value !== 'string' || !value.trim()))
      throw new Error('Choose a play status.');
    if (
      (key === 'started' || key === 'finished') &&
      value !== null &&
      (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    )
      throw new Error('Choose a valid date.');
    await this.updateProperties(file, (fm: Record<string, unknown>) => {
      fm[name] = value;
      if (key === 'status' && value === 'playing' && !fm[property(settings, 'started')])
        fm[property(settings, 'started')] = localDate();
      if (key === 'status' && value === 'completed' && !fm[property(settings, 'finished')])
        fm[property(settings, 'finished')] = localDate();
    });
  }
  async session(file: TFile, note: string, minutes: number | null): Promise<void> {
    const settings = this.settingsFor(file);
    await this.updateProperties(
      file,
      (parsed) => {
        const key = property(settings, 'playtime_minutes');
        const previous = parsed[key];
        if (
          previous !== undefined &&
          previous !== null &&
          (typeof previous !== 'number' || !Number.isFinite(previous) || previous < 0)
        )
          throw new Error('The existing playtime property is not a nonnegative number.');
        parsed[key] = (typeof previous === 'number' ? previous : 0) + (minutes ?? 0);
      },
      (body) => appendSession(body, localDate(), note, minutes),
    );
  }
  private async updateProperties(
    file: TFile,
    update: (properties: Record<string, unknown>) => void,
    updateBody?: (body: string) => string,
  ): Promise<void> {
    // The YAML tree preserves comments; Vault.process keeps properties and body atomic.
    await this.app.vault.process(file, (content) => {
      const info = getFrontMatterInfo(content);
      const yaml = patchProperties(info.exists ? info.frontmatter : '', update);
      const body = content.slice(info.contentStart);
      return `---\n${yaml}\n---\n${updateBody ? updateBody(body) : body}`;
    });
  }
  previewChanges(file: TFile, game: Game, groups: FieldGroup[]): MetadataChange[] {
    const fm: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!record(fm)) throw new Error('Note properties are not indexed yet. Try again in a moment.');
    const baseline = this.context.snapshots[`gnd:${game.slug}`];
    const settings = this.settingsFor(file);
    const metadata = sourceMetadata(game, groups, settings);
    const incoming = baseline
      ? Object.fromEntries(Object.entries(metadata).filter(([key]) => key in baseline))
      : metadata;
    return changesFor(fm, incoming, baseline, settings);
  }
  async applyChanges(
    file: TFile,
    game: Game,
    changes: MetadataChange[],
    selected: Set<string>,
  ): Promise<void> {
    if (!selected.size) throw new Error(text(this.settings, 'noSelection'));
    const chosen = changes.filter((change) => selected.has(change.key));
    await this.updateProperties(file, (fm: Record<string, unknown>) => {
      for (const change of chosen) {
        if (JSON.stringify(fm[change.key]) !== JSON.stringify(change.before))
          throw new Error('This note changed after the preview. Review the changes again.');
      }
      for (const change of chosen) fm[change.key] = change.after;
    });
    const id = `gnd:${game.slug}`;
    this.context.snapshots[id] = {
      ...this.context.snapshots[id],
      ...Object.fromEntries(chosen.map((change) => [change.key, change.after])),
    };
    await this.context.save();
  }
}

export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
export function localDate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
