import {
  DEFAULT_SETTINGS,
  FIELD_GROUPS,
  type FieldGroup,
  type Game,
  type LibraryItem,
  type Metadata,
  type MetadataValue,
  type PlayStatus,
  type ShelfSettings,
} from './domain';
import { parseDocument } from 'yaml';

export const JOURNAL_MARKER = '<!-- game-shelf:journal -->';
export const PERSONAL_KEYS = [
  'status',
  'rating',
  'ownership',
  'started',
  'finished',
  'playtime_minutes',
  'tags',
] as const;
export const PROPERTY_KEYS = [
  'game_id',
  'game_source',
  'game_slug',
  'game_url',
  'title',
  'release_date',
  'release_dates',
  'platforms',
  'genres',
  'developers',
  'publishers',
  'directors',
  'age_rating',
  'release_status',
  'igdb_score',
  'steam_positive_pct',
  'source_updated',
  'source_fetched',
  'cover',
  'cssclasses',
  ...PERSONAL_KEYS,
] as const;

export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function isMetadataValue(value: unknown): value is MetadataValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (Array.isArray(value) && value.every((v) => typeof v === 'string'))
  );
}
export function property(settings: ShelfSettings, key: string): string {
  return settings.propertyNames[key] ?? key;
}
export function validateMapping(mapping: unknown): Record<string, string> {
  if (!record(mapping)) throw new Error('Property names must be a JSON object.');
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(mapping)) {
    if (
      !PROPERTY_KEYS.some((k) => k === key) ||
      typeof value !== 'string' ||
      !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(value) ||
      ['__proto__', 'constructor', 'prototype'].includes(value)
    )
      throw new Error(`Invalid property name: ${key}`);
    if (key === 'cssclasses' && value !== 'cssclasses')
      throw new Error('The reserved cssclasses property cannot be renamed.');
    result[key] = value;
  }
  const names = PROPERTY_KEYS.map((key) => result[key] ?? key);
  if (new Set(names).size !== names.length)
    throw new Error('Two properties cannot use the same name.');
  return result;
}
export function vaultPath(input: string, allowRoot = false): string {
  const path = input.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (!path && allowRoot) return '';
  if (
    !path ||
    path.startsWith('/') ||
    /[\p{Cc}:*?"<>|]/u.test(path) ||
    path.split('/').some((p) => !p || p === '.' || p === '..' || p.startsWith('.'))
  )
    throw new Error('Choose a normal folder inside this vault.');
  return path;
}
export function filename(
  template: string,
  game: Pick<Game, 'title' | 'slug' | 'release_date' | 'platforms'>,
): string {
  const values: Record<string, string> = {
    title: game.title,
    slug: game.slug,
    year: game.release_date?.slice(0, 4) ?? '',
    platform: game.platforms[0] ?? '',
  };
  const rendered = template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => {
    if (!(key in values)) throw new Error(`Unknown filename token: ${key}`);
    return values[key] ?? '';
  });
  const cleaned = rendered
    .normalize('NFC')
    .replace(/[\p{Cc}\\/:*?"<>|#[\]^]/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\.+|[. ]+$/g, '')
    .trim()
    .slice(0, 150)
    .trim();
  if (!cleaned || /{{|}}/.test(cleaned))
    throw new Error('The filename is empty or contains an invalid token.');
  return /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(cleaned)
    ? `Game ${cleaned}`
    : cleaned;
}
export function markdownText(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/([\\`*_{}[\]#|!])/g, '\\$1')
    .replace(/[\r\n]+/g, ' ');
}
function link(title: string, url: string): string {
  return `[${markdownText(title)}](<${url.replace(/[<>\s]/g, (c) => encodeURIComponent(c))}>)`;
}
export function sourceMetadata(
  game: Game,
  groups: readonly FieldGroup[],
  settings: ShelfSettings,
): Metadata {
  const fields: Metadata = {
    game_id: `gnd:${game.slug}`,
    game_source: 'gamesneverdie',
    game_slug: game.slug,
    game_url: game.url,
    title: game.title,
    source_updated: game.updated_at,
    source_fetched: game.fetched_at,
  };
  if (groups.includes('basics'))
    Object.assign(fields, {
      release_date: game.release_date,
      release_dates: game.release_dates.map((d) => `${d.scope ?? 'unknown'}: ${d.date}`),
      platforms: game.platforms,
      genres: game.tags,
      developers: game.developers,
      publishers: game.publishers,
      directors: game.directors,
      age_rating: game.age_rating,
      release_status: game.status,
    });
  if (groups.includes('ratings'))
    Object.assign(fields, {
      igdb_score: game.ratings.igdb,
      steam_positive_pct: game.ratings.steam,
    });
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [property(settings, key), value]),
  );
}
export function sourceBody(game: Game, groups: readonly FieldGroup[], heading: string): string {
  const lines = [
    `## ${heading}`,
    '',
    `${link('Games Never Die', game.url)} · ${game.fetched_at.slice(0, 10)}`,
  ];
  if (groups.includes('description') && game.description)
    lines.push(
      '',
      game.description
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/`/g, '&#96;'),
    );
  if (groups.includes('stores') && game.stores.length)
    lines.push('', game.stores.map((s) => link(s.name, s.url)).join(' · '));
  if (groups.includes('articles') && game.articles.length)
    lines.push(
      '',
      ...game.articles.map(
        (a) =>
          `- ${link(a.title, a.url)}${a.source ? ` — ${markdownText(a.source)}` : ''}${a.date ? ` (${markdownText(a.date)})` : ''}`,
      ),
    );
  if (groups.includes('media'))
    lines.push(
      '',
      ...game.trailers.map((url, i) => `- ${link(`Trailer ${i + 1}`, url)}`),
      ...game.screenshots.map((url, i) => `- ${link(`Screenshot ${i + 1}`, url)}`),
    );
  if (groups.includes('steam') && game.steam) {
    const steam = game.steam;
    lines.push(
      '',
      `Steam · ${markdownText(steam.price?.formatted ?? '—')} · ${steam.players ?? '—'} players · ${markdownText(steam.fetched_at.slice(0, 10))}`,
    );
  }
  return lines.join('\n');
}
export function renderBody(template: string, values: Record<string, string>): string {
  return (
    template
      .replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => {
        if (!(key in values)) throw new Error(`Unknown template token: ${key}`);
        return values[key] ?? '';
      })
      .trim() + '\n'
  );
}
export function renderNote(metadata: Metadata, body: string): string {
  const yaml = Object.entries(metadata)
    .map(
      ([key, value]) =>
        `${key}: ${JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')}`,
    )
    .join('\n');
  return `---\n${yaml}\n---\n\n${body}`;
}
export function patchProperties(
  yaml: string,
  update: (properties: Record<string, unknown>) => void,
): string {
  const document = parseDocument(yaml, { uniqueKeys: true });
  if (document.errors.length)
    throw new Error(
      'The note properties contain invalid YAML. Fix them before updating this note.',
    );
  const original: unknown = document.toJS({ maxAliasCount: 100 });
  if (original !== null && !record(original))
    throw new Error('The note properties must be a YAML mapping.');
  const before = original ?? {};
  const after: Record<string, unknown> = { ...before };
  update(after);
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
    if (after[key] === undefined) document.delete(key);
    else document.set(key, after[key]);
  }
  return document.toString({ lineWidth: 0 }).trimEnd();
}
export interface MetadataChange {
  key: string;
  before: unknown;
  after: MetadataValue;
  conflict: boolean;
}
export function changesFor(
  current: Record<string, unknown>,
  incoming: Metadata,
  baseline: Metadata | undefined,
  settings: ShelfSettings,
): MetadataChange[] {
  const protectedNames = new Set(PERSONAL_KEYS.map((k) => property(settings, k)));
  return Object.entries(incoming).flatMap<MetadataChange>(([key, after]) => {
    if (protectedNames.has(key))
      throw new Error('A source property conflicts with a personal property.');
    const raw = current[key];
    if (JSON.stringify(raw) === JSON.stringify(after)) return [];
    if (raw !== undefined && !isMetadataValue(raw))
      return [{ key, before: raw, after, conflict: true }];
    const before = raw;
    const conflict =
      before !== undefined &&
      before !== null &&
      JSON.stringify(before) !== JSON.stringify(baseline?.[key]);
    return [{ key, before, after, conflict }];
  });
}
export function appendSession(
  body: string,
  date: string,
  note: string,
  minutes: number | null,
): string {
  if (!body.includes(JOURNAL_MARKER))
    throw new Error('The play-log marker is missing from this note.');
  if (!note.trim()) throw new Error('Write a session note.');
  if (minutes !== null && (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440))
    throw new Error('Minutes must be between 0 and 1440.');
  const safe = note.trim().replace(/<!--\s*game-shelf:/gi, '&lt;!-- game-shelf:');
  return body.replace(
    JOURNAL_MARKER,
    `${JOURNAL_MARKER}\n\n### ${date}${minutes !== null ? ` · ${minutes} min` : ''}\n\n${safe}`,
  );
}
export function readStatus(value: unknown): PlayStatus {
  return typeof value === 'string' && value.trim() ? value : 'backlog';
}
function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : typeof value === 'string'
      ? [value]
      : [];
}
export function libraryItem(
  path: string,
  modified: number,
  fm: Record<string, unknown>,
  settings: ShelfSettings,
): LibraryItem | null {
  const read = (key: string) => fm[property(settings, key)];
  const id = read('game_id');
  if (typeof id !== 'string' || !id) return null;
  const title = read('title'),
    slug = read('game_slug'),
    cover = read('cover'),
    rating = read('rating'),
    date = read('release_date'),
    minutes = read('playtime_minutes');
  return {
    path,
    id,
    slug: typeof slug === 'string' ? slug : null,
    title:
      typeof title === 'string' ? title : (path.split('/').pop()?.replace(/\.md$/, '') ?? path),
    status: readStatus(read('status')),
    rating: typeof rating === 'number' && rating >= 0 && rating <= 5 ? rating : null,
    platforms: strings(read('platforms')),
    genres: strings(read('genres')),
    cover: typeof cover === 'string' ? cover : null,
    releaseDate: typeof date === 'string' ? date : null,
    modified,
    minutes: typeof minutes === 'number' && Number.isFinite(minutes) && minutes >= 0 ? minutes : 0,
  };
}
export function parseSettings(raw: unknown): ShelfSettings {
  if (raw === undefined || raw === null) return structuredClone(DEFAULT_SETTINGS);
  if (!record(raw)) throw new Error('Saved settings are invalid.');
  const result = structuredClone(DEFAULT_SETTINGS);
  for (const key of ['folder', 'coverFolder', 'filename', 'template'] as const)
    if (typeof raw[key] === 'string') result[key] = raw[key];
  result.folder = vaultPath(result.folder, true);
  result.coverFolder = vaultPath(result.coverFolder);
  filename(result.filename, {
    title: 'Game',
    slug: 'game',
    release_date: '2026',
    platforms: ['PC'],
  });
  renderBody(result.template, {
    title: 'Game',
    cover: '',
    source: '',
    notes_heading: 'Notes',
    journal_heading: 'Play log',
    journal_marker: JOURNAL_MARKER,
  });
  if (raw.language === 'ja' || raw.language === 'en' || raw.language === 'auto')
    result.language = raw.language;
  if (typeof raw.online === 'boolean') result.online = raw.online;
  if (typeof raw.saveCover === 'boolean') result.saveCover = raw.saveCover;
  const groups = raw.groups;
  if (Array.isArray(groups)) result.groups = FIELD_GROUPS.filter((g) => groups.includes(g));
  if (
    Array.isArray(raw.statuses) &&
    raw.statuses.every(
      (s): s is string => typeof s === 'string' && s.trim().length > 0 && s.length <= 40,
    ) &&
    raw.statuses.length > 0
  )
    result.statuses = [...new Set(raw.statuses)];
  if (raw.propertyNames !== undefined) result.propertyNames = validateMapping(raw.propertyNames);
  return result;
}
