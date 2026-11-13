import type { Game, SearchItem, SearchPage, SteamData } from './domain';

const BASE = 'https://gamesneverdie.com';
const GAME_TTL = 24 * 60 * 60 * 1000;
const SEARCH_TTL = 60 * 60 * 1000;
const STEAM_TTL = 5 * 60 * 1000;
const CACHE_LIMIT = 128;

type Transport = (url: string) => Promise<{ status: number; text: string }>;
type Cached<T> = { value: T; at: number };

export class SourceError extends Error {}

function text(element: Element | null): string {
  if (!element) return '';
  const copy = element.ownerDocument.createElement('div');
  copy.append(element.cloneNode(true));
  copy.querySelectorAll('script,style,svg,[hidden]').forEach((node) => node.remove());
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function safeUrl(raw: string | null, hosts?: readonly string[]): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw, BASE);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      (hosts && !hosts.includes(url.hostname)) ||
      (!hosts && (url.hostname === 'localhost' || !url.hostname.includes('.')))
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

function image(element: Element | null): string | null {
  return safeUrl(element?.querySelector('img')?.getAttribute('src') ?? null, [
    'gamesneverdie.com',
    'media.gamesneverdie.com',
  ]);
}

function number(value: string): number | null {
  return /^\d+(?:\.\d+)?%?$/.test(value) ? Number(value.replace('%', '')) : null;
}

function gameLink(anchor: Element): Pick<SearchItem, 'slug' | 'title' | 'url'> | null {
  const raw = anchor.getAttribute('href');
  const url = safeUrl(raw, ['gamesneverdie.com']);
  if (!url) return null;
  const parsed = new URL(url);
  const match = /^\/ja\/games\/([a-z0-9][a-z0-9-]*)$/.exec(parsed.pathname);
  if (!match || parsed.search || parsed.hash || !match[1]) return null;
  const title =
    text(anchor.querySelector('.title')) || anchor.getAttribute('aria-label') || text(anchor);
  return title ? { slug: match[1], title, url: `${BASE}${parsed.pathname}` } : null;
}

function documentOf(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

export function parseGame(html: string, slug: string): Game {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new SourceError('Invalid game slug');
  const doc = documentOf(html);
  const hero = doc.querySelector('main #hero');
  const details = doc.querySelector('main #details');
  const title = text(hero?.querySelector('h1') ?? null);
  if (!hero || !details || !title)
    throw new SourceError(
      'Expected game title and details section; source layout may have changed',
    );
  const rows = new Map<string, Element>();
  details.querySelectorAll('.r').forEach((row) => {
    const label = text(row.querySelector('dt'));
    const value = row.querySelector('dd');
    if (label && value) rows.set(label, value);
  });
  const row = (label: string): Element | null => rows.get(label) ?? null;
  const names = (label: string): string[] =>
    text(row(label))
      .split('、')
      .map((s) => s.trim())
      .filter(Boolean);
  const links = (label: string): string[] =>
    Array.from(row(label)?.querySelectorAll('a') ?? [])
      .map(text)
      .filter(Boolean);
  const dates = Array.from(row('発売日')?.querySelectorAll('.date-scope') ?? [])
    .map((span) => ({
      date: text(span.querySelector('time')) || text(span),
      scope: span.querySelector('svg')?.getAttribute('aria-label') ?? null,
    }))
    .filter((item) => item.date);
  const releaseDate = dates[0]?.date || text(row('発売日')) || null;
  const ratings = new Map<string, number | null>();
  hero
    .querySelectorAll('a.c')
    .forEach((a) => ratings.set(text(a.querySelector('.l')), number(text(a.querySelector('.n')))));
  const media = doc.querySelector('main #media');
  const screenshots = new Set<string>();
  const trailers = new Set<string>();
  media?.querySelectorAll('img').forEach((img) => {
    const raw = img.getAttribute('src');
    if (raw?.includes('/t_screenshot_')) {
      const url = safeUrl(raw, ['media.gamesneverdie.com', 'gamesneverdie.com']);
      if (url) screenshots.add(url);
    }
    const thumb = safeUrl(raw, ['i.ytimg.com']);
    const video = thumb && /^\/vi\/([\w-]+)\//.exec(new URL(thumb).pathname);
    if (video?.[1]) trailers.add(`https://www.youtube.com/watch?v=${video[1]}`);
  });
  const stores: Game['stores'] = [];
  hero.querySelectorAll('a[data-store]').forEach((a) => {
    const url = safeUrl(a.getAttribute('href'));
    const store = a.getAttribute('data-store');
    if (url && store) stores.push({ store, name: text(a), url });
  });
  const articles: Game['articles'] = [];
  doc.querySelectorAll('main #articles a.card-link').forEach((a) => {
    const url = safeUrl(a.getAttribute('href'));
    const articleTitle = text(a.querySelector('h3'));
    if (url && articleTitle)
      articles.push({
        title: articleTitle,
        url,
        source: text(a.querySelector('cite')) || null,
        date: text(a.querySelector('time')) || null,
        category: text(a.querySelector('.art-tag')) || null,
        summary: text(a.querySelector('.text-box')) || null,
      });
  });
  const related = new Map<string, Game['related'][number]>();
  doc.querySelectorAll('main #related a').forEach((a) => {
    const link = gameLink(a);
    if (link && !related.has(link.slug)) related.set(link.slug, link);
  });
  const about = doc.querySelector('main .about-body');
  const paragraphs = Array.from(about?.querySelectorAll('p') ?? [])
    .map(text)
    .filter(Boolean);
  const updated = /\d{4}-\d{2}-\d{2}/.exec(text(doc.querySelector('main .ur-updated')));
  return {
    slug,
    url: `${BASE}/ja/games/${slug}`,
    title,
    description: paragraphs.join('\n\n') || text(about) || null,
    developers: names('開発元'),
    publishers: names('販売元'),
    directors: names('ディレクター'),
    release_date: releaseDate,
    release_date_scope: dates[0]?.scope ?? null,
    release_dates: dates,
    platforms: links('プラットフォーム'),
    tags: links('タグ'),
    age_rating: text(row('年齢区分')) || null,
    status: text(row('販売状況')) || null,
    ratings: { igdb: ratings.get('igdb') ?? null, steam: ratings.get('steam') ?? null },
    cover_url: image(hero.querySelector('.cover')),
    hero_url: image(hero.querySelector('.keyart')),
    screenshots: [...screenshots],
    trailers: [...trailers],
    stores,
    articles,
    related: [...related.values()],
    updated_at: updated?.[0] ?? null,
    fetched_at: new Date().toISOString(),
    steam: null,
  };
}

export function parseSearch(html: string, query: string, page: number): SearchPage {
  const main = documentOf(html).querySelector('main');
  const count = /([\d,]+)\s*件/.exec(text(main?.querySelector('.hits') ?? null));
  const empty = Array.from(main?.querySelectorAll('p') ?? []).some(
    (p) => text(p) === '該当するタイトルがありません',
  );
  if (!count && !empty)
    throw new SourceError('Expected search result count; source layout may have changed');
  const total = count ? Number(count[1]?.replaceAll(',', '')) : 0;
  const items: SearchItem[] = [];
  const seen = new Set<string>();
  main?.querySelectorAll('ul.card a').forEach((a) => {
    const link = gameLink(a);
    if (link && !seen.has(link.slug)) {
      seen.add(link.slug);
      items.push({
        ...link,
        cover_url: image(a),
        rating: number(text(a.querySelector('.score'))),
        subtitle: text(a.querySelector('.meta')) || null,
      });
    }
  });
  if (total && !items.length)
    throw new SourceError('Search reports matches but no game cards could be parsed');
  const position = /PAGE\s+(\d+)\s*\/\s*(\d+)/.exec(text(main?.querySelector('.pos') ?? null));
  return {
    query,
    page,
    total,
    total_pages: total ? Number(position?.[2] ?? 1) : 0,
    items,
    fetched_at: new Date().toISOString(),
  };
}

function slugOf(identifier: string): string {
  if (typeof identifier !== 'string')
    throw new SourceError('Expected a game slug or same-origin HTTPS game URL');
  const value = identifier.trim();
  if (/^[a-z0-9][a-z0-9-]*$/.test(value)) return value;
  try {
    const url = new URL(value);
    const match = /^\/ja\/games\/([a-z0-9][a-z0-9-]*)\/?$/.exec(url.pathname);
    if (url.origin === BASE && !url.username && !url.password && !url.search && match?.[1])
      return match[1];
  } catch {
    /* Invalid identifier is reported below. */
  }
  throw new SourceError('Expected a game slug or same-origin HTTPS game URL');
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isPrice(value: unknown): value is NonNullable<SteamData['price']> {
  return (
    record(value) &&
    typeof value.free === 'boolean' &&
    (value.formatted === null || typeof value.formatted === 'string') &&
    (value.initialFormatted === null || typeof value.initialFormatted === 'string') &&
    typeof value.discount === 'number' &&
    Number.isFinite(value.discount)
  );
}

function isHistory(value: unknown): value is NonNullable<SteamData['history']> {
  return (
    record(value) &&
    typeof value.from === 'string' &&
    Array.isArray(value.peaks) &&
    value.peaks.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    typeof value.peak === 'number' &&
    Number.isFinite(value.peak)
  );
}

function parseSteam(body: string): SteamData {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new SourceError('Steam endpoint returned invalid JSON');
  }
  if (
    !record(value) ||
    !nullableNumber(value.players) ||
    typeof value.playersBase !== 'boolean' ||
    !('review' in value) ||
    !('reviewLocal' in value) ||
    !('price' in value) ||
    !('history' in value)
  ) {
    throw new SourceError('Steam endpoint returned an unexpected response shape');
  }
  const review = (item: unknown): item is NonNullable<SteamData['review']> =>
    record(item) &&
    typeof item.pct === 'number' &&
    Number.isFinite(item.pct) &&
    typeof item.desc === 'string' &&
    typeof item.total === 'number' &&
    Number.isFinite(item.total);
  const price = value.price;
  const history = value.history;
  if (
    (value.review !== null && !review(value.review)) ||
    (value.reviewLocal !== null && !review(value.reviewLocal)) ||
    (price !== null && !isPrice(price)) ||
    (history !== null && !isHistory(history))
  ) {
    throw new SourceError('Steam endpoint returned an unexpected response shape');
  }
  return {
    players: value.players,
    playersBase: value.playersBase,
    review: value.review,
    reviewLocal: value.reviewLocal,
    price,
    history,
    fetched_at: new Date().toISOString(),
  };
}

export class GameSource {
  private readonly games = new Map<string, Cached<Game>>();
  private readonly searches = new Map<string, Cached<SearchPage>>();
  private readonly steam = new Map<string, Cached<SteamData>>();
  private readonly inFlight = new Map<string, Promise<string>>();
  private nextRequestAt = 0;

  constructor(
    private readonly transport: Transport,
    private readonly options: { now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
  ) {}

  clearCache(): void {
    this.games.clear();
    this.searches.clear();
    this.steam.clear();
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }
  private sleep(ms: number): Promise<void> {
    return (
      this.options.sleep ?? ((delay) => new Promise((resolve) => window.setTimeout(resolve, delay)))
    )(ms);
  }

  private request(url: string): Promise<string> {
    const existing = this.inFlight.get(url);
    if (existing) return existing;
    const due = Math.max(this.now(), this.nextRequestAt);
    this.nextRequestAt = due + 1000;
    const pending = (async () => {
      const wait = due - this.now();
      if (wait > 0) await this.sleep(wait);
      let response: Awaited<ReturnType<Transport>>;
      try {
        response = await this.transport(url);
      } catch (error) {
        throw new SourceError(`Unable to fetch ${url}: ${String(error)}`);
      }
      if (response.status !== 200)
        throw new SourceError(`HTTP ${response.status} for ${url}; no retry performed`);
      if (typeof response.text !== 'string')
        throw new SourceError(`Invalid response body for ${url}`);
      if (new TextEncoder().encode(response.text).byteLength > 8 * 1024 * 1024) {
        throw new SourceError(`Response exceeds 8 MiB for ${url}`);
      }
      return response.text;
    })();
    this.inFlight.set(url, pending);
    void pending.finally(() => this.inFlight.delete(url)).catch(() => undefined);
    return pending;
  }

  private async load<T extends { fetched_at: string }>(
    url: string,
    cache: Map<string, Cached<T>>,
    ttl: number,
    parse: (body: string) => T,
    refresh = false,
  ): Promise<T> {
    const entry = cache.get(url);
    if (!refresh && entry && this.now() >= entry.at && this.now() - entry.at < ttl)
      return entry.value;
    const value = parse(await this.request(url));
    const at = this.now();
    value.fetched_at = new Date(at).toISOString();
    cache.delete(url);
    cache.set(url, { value, at });
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value ?? '');
    return value;
  }

  async search(query: string, page = 1): Promise<SearchPage> {
    if (typeof query !== 'string') throw new SourceError('query must contain 1–500 characters');
    query = query.trim();
    if (!query || query.length > 500) throw new SourceError('query must contain 1–500 characters');
    if (!Number.isSafeInteger(page) || page < 1)
      throw new SourceError('page must be a positive integer');
    const params = new URLSearchParams({ q: query });
    if (page !== 1) params.set('page', String(page));
    const url = `${BASE}/ja/search?${params}`;
    return this.load(url, this.searches, SEARCH_TTL, (body) => parseSearch(body, query, page));
  }

  async get(identifier: string, includeSteam = false, refresh = false): Promise<Game> {
    const slug = slugOf(identifier);
    const url = `${BASE}/ja/games/${slug}`;
    const game = await this.load(
      url,
      this.games,
      GAME_TTL,
      (body) => parseGame(body, slug),
      refresh,
    );
    if (!includeSteam) return game;
    const store = game.stores.find((item) => item.store === 'steam');
    const storeUrl = store && new URL(store.url);
    const app =
      storeUrl?.hostname === 'store.steampowered.com' &&
      storeUrl.origin === 'https://store.steampowered.com' &&
      !storeUrl.username &&
      !storeUrl.password
        ? /^\/app\/(\d+)(?:\/|$)/.exec(storeUrl.pathname)?.[1]
        : undefined;
    if (!app) return game;
    const steamUrl = `${BASE}/api/steam?appid=${app}&loc=ja`;
    const steam = await this.load(steamUrl, this.steam, STEAM_TTL, parseSteam, refresh);
    return { ...game, steam };
  }
}
