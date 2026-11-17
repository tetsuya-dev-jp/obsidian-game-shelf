import type { Game, SearchItem, SearchPage } from './domain';
import { LocalizedError } from './translations';

export type IgdbRequest = { url: string; method: 'POST'; headers: Record<string, string>; body: string };
type Transport = (request: IgdbRequest) => Promise<{ status: number; text: string }>;
type Credentials = { clientId: string; clientSecret: string };
type Options = { now?: () => number; sleep?: (ms: number) => Promise<void> };
type Code = 'credentials' | 'auth' | 'rateLimit' | 'network' | 'response' | 'notFound' | 'identifier';

const FIELDS = 'id,name,slug,summary,storyline,rating,cover.url,artworks.url,screenshots.url,videos.video_id,platforms.name,genres.name,themes.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,release_dates.y,release_dates.m,release_dates.d,release_dates.date_format.format,release_dates.human,release_dates.platform.name,release_dates.release_region.region,websites.url,updated_at';
const PAGE_SIZE = 20;
const CACHE_LIMIT = 128;
const CACHE_TTL = 24 * 60 * 60 * 1000;
const SEARCH_TTL = 60 * 60 * 1000;

export class IgdbError extends Error {
  constructor(public readonly code: Code) {
    super({
      credentials: 'IGDB credentials are required.',
      auth: 'IGDB authentication failed.',
      rateLimit: 'IGDB rate limit reached.',
      network: 'IGDB network request failed.',
      response: 'IGDB returned an invalid response.',
      notFound: 'IGDB game was not found.',
      identifier: 'Invalid IGDB game identifier.',
    }[code]);
    this.name = 'IgdbError';
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null;
}
function string(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function names(value: unknown): string[] {
  return array(value).map((item) => string(record(item)?.name)).filter((name): name is string => name !== null);
}
function rating(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}
function safeUrl(value: unknown, image = false): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value.startsWith('//') ? `https:${value}` : value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash ||
      (image && url.hostname !== 'images.igdb.com') || (!image && (url.hostname === 'localhost' || !url.hostname.includes('.')))) return null;
    return url.href;
  } catch {
    return null;
  }
}
function artwork(value: unknown, size: 't_cover_big' | 't_screenshot_huge'): string | null {
  const safe = safeUrl(record(value)?.url, true);
  if (!safe) return null;
  const url = new URL(safe);
  url.pathname = url.pathname.replace(/^\/igdb\/image\/upload\/t_[^/]+\//, `/igdb/image/upload/${size}/`);
  return url.href;
}
function identifierOf(value: string): { field: 'id' | 'slug'; value: string } {
  if (typeof value !== 'string') throw new IgdbError('identifier');
  const input = value.trim();
  if (/^[1-9]\d*$/.test(input) && Number.isSafeInteger(Number(input))) return { field: 'id', value: input };
  if (/^\d+$/.test(input)) throw new IgdbError('identifier');
  if (/^https?:/i.test(input)) {
    try {
      const url = new URL(input);
      if (url.origin !== 'https://www.igdb.com' || url.username || url.password || input.includes('?') || input.includes('#')) throw new IgdbError('identifier');
      const match = /^\/games\/([a-z0-9][a-z0-9-]*)\/?$/.exec(url.pathname);
      if (match?.[1]) return { field: 'slug', value: match[1] };
    } catch { /* invalid input below */ }
    throw new IgdbError('identifier');
  }
  if (/^[a-z0-9][a-z0-9-]*$/.test(input)) return { field: 'slug', value: input };
  throw new IgdbError('identifier');
}
function parseRows(text: string): Record<string, unknown>[] {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new IgdbError('response'); }
  if (!Array.isArray(value) || value.some((item) => !record(item))) throw new IgdbError('response');
  return value.map((item) => record(item)).filter((item): item is Record<string, unknown> => item !== null);
}
function parseCount(text: string): number {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new IgdbError('response'); }
  const count = record(value)?.count;
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) throw new IgdbError('response');
  return count;
}
function required(row: Record<string, unknown>): { id: string; slug: string; title: string } {
  const id = row.id;
  const title = string(row.name);
  const slug = string(row.slug);
  if (!Number.isSafeInteger(id) || typeof id !== 'number' || id <= 0 || !title || !slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new IgdbError('response');
  return { id: String(id), slug, title };
}
function dateOf(value: unknown): { date: string; sortKey: string } | null {
  const row = record(value);
  const format = string(record(row?.date_format)?.format);
  const human = string(row?.human);
  if (format === 'TBD') return { date: human ?? 'TBD', sortKey: '9999-12-31' };
  if (!row || typeof row.y !== 'number' || !Number.isInteger(row.y) || row.y < 1000 || row.y > 9999)
    return human ? { date: human, sortKey: '9999-12-31' } : null;
  const year = String(row.y);
  const quarter = /^YYYYQ([1-4])$/.exec(format ?? '');
  if (quarter?.[1]) {
    const month = String((Number(quarter[1]) - 1) * 3 + 1).padStart(2, '0');
    return { date: human ?? `${year} Q${quarter[1]}`, sortKey: `${year}-${month}-01` };
  }
  if (format === 'YYYY' || typeof row.m !== 'number' || !Number.isInteger(row.m) || row.m < 1 || row.m > 12)
    return { date: year, sortKey: `${year}-01-01` };
  const month = String(row.m).padStart(2, '0');
  if (format === 'YYYYMMMM' || typeof row.d !== 'number' || !Number.isInteger(row.d) || row.d < 1 || row.d > 31)
    return { date: `${year}-${month}`, sortKey: `${year}-${month}-01` };
  const date = `${year}-${month}-${String(row.d).padStart(2, '0')}`;
  return new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date
    ? { date, sortKey: date }
    : { date: `${year}-${month}`, sortKey: `${year}-${month}-01` };
}
function searchItem(row: Record<string, unknown>): SearchItem {
  const { id, slug, title } = required(row);
  return { source: 'igdb', id, slug, title, url: `https://www.igdb.com/games/${slug}`,
    cover_url: artwork(row.cover, 't_cover_big'), rating: rating(row.rating), subtitle: null };
}
function gameOf(row: Record<string, unknown>, fetchedAt: string): Game {
  const item = searchItem(row);
  const dated = array(row.release_dates).map((entry) => {
    const data = record(entry);
    const date = dateOf(entry);
    const scope = [string(record(data?.release_region)?.region), string(record(data?.platform)?.name)].filter(Boolean).join(' / ') || null;
    return date ? { ...date, scope } : null;
  }).filter((entry): entry is { date: string; sortKey: string; scope: string | null } => entry !== null)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const dates = dated.map(({ date, scope }) => ({ date, scope }));
  const companies = array(row.involved_companies).map(record).filter((entry): entry is Record<string, unknown> => entry !== null);
  const videos = array(row.videos).map((entry) => string(record(entry)?.video_id)).filter((id): id is string => id !== null && /^[\w-]{1,64}$/.test(id));
  const stores = array(row.websites).map((entry) => safeUrl(record(entry)?.url)).filter((url): url is string => url !== null)
    .map((url) => ({ store: new URL(url).hostname, name: new URL(url).hostname, url }));
  const updatedDate = typeof row.updated_at === 'number' && Number.isFinite(row.updated_at) ? new Date(row.updated_at * 1000) : null;
  const updated = updatedDate && Number.isFinite(updatedDate.getTime()) ? updatedDate.toISOString() : null;
  const description = string(row.summary) ?? string(row.storyline);
  return { source: 'igdb', id: item.id, dataLanguage: 'en', slug: item.slug, url: item.url, title: item.title,
    description: description ? description.replace(/<[^>]*>/g, ' ').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim() : null,
    developers: companies.filter((entry) => entry.developer === true).map((entry) => string(record(entry.company)?.name)).filter((name): name is string => name !== null),
    publishers: companies.filter((entry) => entry.publisher === true).map((entry) => string(record(entry.company)?.name)).filter((name): name is string => name !== null),
    directors: [], release_date: dates[0]?.date ?? null, release_date_scope: dates[0]?.scope ?? null, release_dates: dates,
    platforms: names(row.platforms), tags: [...names(row.genres), ...names(row.themes)], age_rating: null, status: null,
    ratings: { igdb: item.rating, steam: null }, cover_url: item.cover_url, hero_url: array(row.artworks).map((value) => artwork(value, 't_screenshot_huge')).find(Boolean) ?? null,
    screenshots: array(row.screenshots).map((value) => artwork(value, 't_screenshot_huge')).filter((url): url is string => url !== null),
    trailers: videos.map((id) => `https://www.youtube.com/watch?v=${id}`), stores, articles: [], related: [], updated_at: updated, fetched_at: fetchedAt, steam: null };
}

export class IgdbSource {
  private credentialKey = '';
  private generation = 0;
  private token: { value: string; expiresAt: number } | null = null;
  private tokenPending: Promise<string> | null = null;
  private queue: Promise<void> = Promise.resolve();
  private nextAt = 0;
  private readonly games = new Map<string, { value: Game; at: number }>();
  private readonly searches = new Map<string, { value: SearchPage; at: number }>();
  private readonly pendingGames = new Map<string, Promise<Game>>();
  private readonly pendingSearches = new Map<string, Promise<SearchPage>>();

  constructor(private readonly transport: Transport, private readonly credentials: () => Credentials, private readonly options: Options = {}) {}
  clearCache(): void { this.games.clear(); this.searches.clear(); }
  private now(): number { return (this.options.now ?? Date.now)(); }
  private sleep(ms: number): Promise<void> { return (this.options.sleep ?? ((delay) => new Promise((resolve) => window.setTimeout(resolve, delay))))(ms); }
  private current(): Credentials {
    const value = this.credentials();
    if (!value || !string(value.clientId) || !string(value.clientSecret)) throw new IgdbError('credentials');
    const key = JSON.stringify([value.clientId, value.clientSecret]);
    if (key !== this.credentialKey) { this.credentialKey = key; this.generation++; this.token = null; this.tokenPending = null; this.clearCache(); this.pendingGames.clear(); this.pendingSearches.clear(); }
    return value;
  }
  private async send(request: IgdbRequest): Promise<{ status: number; text: string }> {
    const previous = this.queue;
    let release = (): void => {};
    this.queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const due = Math.max(this.now(), this.nextAt);
      this.nextAt = due + 250;
      if (due > this.now()) await this.sleep(due - this.now());
      try {
        const result = await this.transport(request);
        if (!result || typeof result.status !== 'number' || typeof result.text !== 'string' || result.text.length > 8 * 1024 * 1024) throw new IgdbError('response');
        return result;
      } catch (error) {
        if (error instanceof IgdbError || error instanceof LocalizedError) throw error;
        throw new IgdbError('network');
      }
    } finally { release(); }
  }
  private async accessToken(value: Credentials, force = false): Promise<string> {
    if (!force && this.token && this.now() < this.token.expiresAt) return this.token.value;
    if (this.tokenPending) return this.tokenPending;
    const key = this.credentialKey;
    const pending = (async () => {
      const response = await this.send({ url: 'https://id.twitch.tv/oauth2/token', method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: value.clientId, client_secret: value.clientSecret, grant_type: 'client_credentials' }).toString() });
      if (response.status === 429) throw new IgdbError('rateLimit');
      if (response.status !== 200) throw new IgdbError('auth');
      let raw: unknown;
      try { raw = JSON.parse(response.text); } catch { throw new IgdbError('response'); }
      const data = record(raw);
      if (!string(data?.access_token) || typeof data?.expires_in !== 'number' || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new IgdbError('response');
      const token = string(data.access_token);
      if (!token) throw new IgdbError('response');
      if (key === this.credentialKey) this.token = { value: token, expiresAt: this.now() + data.expires_in * 1000 - 1000 };
      return token;
    })();
    this.tokenPending = pending;
    try { return await pending; } finally { if (this.tokenPending === pending) this.tokenPending = null; }
  }
  private async api(endpoint: 'games' | 'games/count', body: string, credentials: Credentials): Promise<string> {
    const key = this.credentialKey;
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.accessToken(credentials, attempt === 1);
      const response = await this.send({ url: `https://api.igdb.com/v4/${endpoint}`, method: 'POST',
        headers: { 'Client-ID': credentials.clientId, Authorization: `Bearer ${token}`, Accept: 'application/json' }, body });
      if (key !== this.credentialKey) throw new IgdbError('credentials');
      if (response.status === 401 && attempt === 0) { this.token = null; continue; }
      if (response.status === 401 || response.status === 403) throw new IgdbError('auth');
      if (response.status === 429) throw new IgdbError('rateLimit');
      if (response.status !== 200) throw new IgdbError('response');
      return response.text;
    }
    throw new IgdbError('auth');
  }
  private cached<T>(key: string, cache: Map<string, { value: T; at: number }>, pendingMap: Map<string, Promise<T>>, ttl: number, load: () => Promise<T>, refresh = false): Promise<T> {
    const hit = cache.get(key);
    if (!refresh && hit && this.now() >= hit.at && this.now() - hit.at < ttl) return Promise.resolve(hit.value);
    const running = pendingMap.get(key);
    if (running) return running;
    const generation = this.generation;
    const pending = load().then((value) => {
      if (generation !== this.generation) throw new IgdbError('credentials');
      cache.delete(key); cache.set(key, { value, at: this.now() });
      if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value ?? '');
      return value;
    });
    pendingMap.set(key, pending);
    void pending.finally(() => { if (pendingMap.get(key) === pending) pendingMap.delete(key); }).catch(() => undefined);
    return pending;
  }
  async testConnection(): Promise<void> {
    const credentials = this.current();
    parseCount(await this.api('games/count', 'where id > 0;', credentials));
  }
  async search(query: string, page = 1): Promise<SearchPage> {
    const credentials = this.current();
    if (typeof query !== 'string' || !query.trim() || query.length > 500 || Array.from(query).some((character) => character.charCodeAt(0) < 32)) throw new IgdbError('identifier');
    if (!Number.isSafeInteger(page) || page < 1) throw new IgdbError('identifier');
    const term = query.trim();
    const key = `search:${term}:${page}`;
    return this.cached(key, this.searches, this.pendingSearches, SEARCH_TTL, async () => {
      const escaped = JSON.stringify(term);
      const countRaw = await this.api('games/count', `search ${escaped};`, credentials);
      const total = parseCount(countRaw);
      const rows = total ? parseRows(await this.api('games', `search ${escaped}; fields ${FIELDS}; limit ${PAGE_SIZE}; offset ${(page - 1) * PAGE_SIZE};`, credentials)) : [];
      const items = rows.map(searchItem);
      return { query: term, page, total, total_pages: Math.ceil(total / PAGE_SIZE), items, fetched_at: new Date(this.now()).toISOString() };
    });
  }
  async get(identifier: string, _includeSteam = false, refresh = false): Promise<Game> {
    const credentials = this.current();
    const id = identifierOf(identifier);
    const key = `game:${id.field}:${id.value}`;
    return this.cached(key, this.games, this.pendingGames, CACHE_TTL, async () => {
      const rows = parseRows(await this.api('games', `fields ${FIELDS}; where ${id.field} = ${id.field === 'id' ? id.value : JSON.stringify(id.value)}; limit 1;`, credentials));
      if (!rows.length) throw new IgdbError('notFound');
      const row = rows[0];
      if (!row) throw new IgdbError('response');
      if (id.field === 'id' && String(row.id) !== id.value) throw new IgdbError('response');
      if (id.field === 'slug' && row.slug !== id.value) throw new IgdbError('response');
      return gameOf(row, new Date(this.now()).toISOString());
    }, refresh);
  }
}
