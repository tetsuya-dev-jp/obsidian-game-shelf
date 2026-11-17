import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { GameSource, parseGame, parseSearch } from '../src/source';

const fixture = (name: string): string => readFileSync(`tests/fixtures/${name}`, 'utf8');
const gameHtml = fixture('game.html');
const searchHtml = fixture('search.html');
const noWait = async (): Promise<void> => {};

const steamJson = JSON.stringify({
  players: 7,
  playersBase: false,
  review: { pct: 95, desc: 'Positive', total: 100 },
  reviewLocal: null,
  price: { free: false, formatted: '¥100', initialFormatted: null, discount: 0 },
  history: { from: '2024-01', peaks: [7], peak: 7 },
});

describe('HTML parsing', () => {
  it('extracts regional dates, numbers, media and article metadata without sidebar content', () => {
    const game = parseGame(gameHtml, 'test-game');
    expect(game.title).toBe('Test & Game');
    expect(game.description).toBe('A fictional game.\n\nSecond paragraph.');
    expect(game.developers).toEqual(['Studio A', 'Studio B']);
    expect(game.platforms).toEqual(['PC', 'Steam']);
    expect(game.ratings).toEqual({ igdb: 89.5, steam: 95 });
    expect(game.release_dates).toEqual([
      { date: '2023-12-12', scope: 'JP' },
      { date: '2019-05-28', scope: 'world' },
    ]);
    expect(game.release_date_scope).toBe('JP');
    expect(game.updated_at).toBe('2026-11-12');
    expect(game.articles).toEqual([
      {
        title: 'Test review',
        url: 'https://example.com/review',
        source: 'Example',
        date: '2026-11-01',
        category: 'レビュー',
        summary: 'Brief description.',
      },
    ]);
    expect(game.related.map((item) => item.slug)).toEqual(['related-game']);
    expect(game.screenshots).toEqual([
      'https://media.gamesneverdie.com/t_screenshot_huge/test.webp',
    ]);
    expect(game.trailers).toEqual(['https://www.youtube.com/watch?v=video-123']);
  });

  it('keeps unknown facts absent and rejects a changed game shape', () => {
    const game = parseGame(
      '<main><div id="hero"><h1>Unreleased</h1></div><section id="details"></section></main>',
      'unreleased',
    );
    expect(game.release_date).toBeNull();
    expect(game.release_dates).toEqual([]);
    expect(game.ratings).toEqual({ igdb: null, steam: null });
    expect(() => parseGame('<main><h1>Blocked</h1></main>', 'x')).toThrow(/Expected game/);
  });

  it('ignores executable, decorative and hidden text while preserving date scope', () => {
    const html = gameHtml.replace(
      'Test &amp; Game',
      'Test &amp; Game<script>badScript()</script><style>.bad{color:red}</style>' +
        '<svg><title>Decoration</title></svg><span hidden>Hidden title</span>',
    );
    const game = parseGame(html, 'test-game');
    expect(game.title).toBe('Test & Game');
    expect(game.release_dates[0]?.scope).toBe('JP');
  });

  it('ignores a hidden root element when extracting a required title', () => {
    expect(() => parseGame(gameHtml.replace('<h1>', '<h1 hidden>'), 'test-game')).toThrow(
      /Expected game title/,
    );
  });

  it('parses only result cards, including zero results, and rejects a changed search shape', () => {
    const page = parseSearch(searchHtml, 'Test', 1);
    expect([page.total, page.total_pages]).toEqual([1234, 45]);
    expect(page.items.map((item) => item.slug)).toEqual(['test-game', 'another-game']);
    expect(page.items[1]?.rating).toBeNull();
    expect(
      parseSearch('<main><p>該当するタイトルがありません</p></main>', 'none', 1).items,
    ).toEqual([]);
    expect(() => parseSearch('<main><p class="hits">1 件</p></main>', 'x', 1)).toThrow(
      /no game cards/,
    );
    expect(() => parseSearch('<h1>Blocked</h1>', 'x', 1)).toThrow(/Expected search/);
  });

  it('discards unsafe cover and source links', () => {
    const html = gameHtml
      .replace('https://media.gamesneverdie.com/cover.webp', 'javascript:alert(1)')
      .replace('https://example.com/review', 'http://example.com/review');
    const game = parseGame(html, 'test-game');
    expect(game.cover_url).toBeNull();
    expect(game.articles).toEqual([]);
  });
});

describe('GameSource', () => {
  it('deduplicates concurrent URL requests and retains fetch timestamps on cache hits', async () => {
    let resolveFetch: ((response: { status: number; text: string }) => void) | undefined;
    const transport = vi.fn(
      () =>
        new Promise<{ status: number; text: string }>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const source = new GameSource(transport, { now: () => 1000, sleep: noWait });
    const first = source.get('test-game');
    const second = source.get('https://gamesneverdie.com/ja/games/test-game#details');
    resolveFetch?.({ status: 200, text: gameHtml });
    const [a, b] = await Promise.all([first, second]);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(a.fetched_at).toBe(new Date(1000).toISOString());
    expect(b.fetched_at).toBe(a.fetched_at);
    expect((await source.get('test-game')).fetched_at).toBe(a.fetched_at);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('paces distinct URLs and expires search/game caches without stale fallback', async () => {
    let now = 1000;
    const waits: number[] = [];
    const transport = vi.fn(async (url: string) => ({
      status: 200,
      text: url.includes('/search?') ? searchHtml : gameHtml,
    }));
    const source = new GameSource(transport, {
      now: () => now,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    await source.get('test-game');
    await source.search('Test');
    expect(waits).toEqual([1000]);
    now += 60 * 60 * 1000;
    await source.search('Test');
    expect(transport).toHaveBeenCalledTimes(3);
    await source.get('test-game');
    expect(transport).toHaveBeenCalledTimes(3);
    source.clearCache();
    await source.get('test-game');
    expect(transport).toHaveBeenCalledTimes(4);
  });

  it('expires game at 24 hours, Steam at 5 minutes, and refreshes on request', async () => {
    let now = 1000;
    const transport = vi.fn(async (url: string) => ({
      status: 200,
      text: url.includes('/api/steam?') ? steamJson : gameHtml,
    }));
    const source = new GameSource(transport, { now: () => now, sleep: noWait });
    const first = await source.get('test-game', true);
    now += 5 * 60 * 1000;
    const second = await source.get('test-game', true);
    expect(second.fetched_at).toBe(first.fetched_at);
    expect(second.steam?.fetched_at).not.toBe(first.steam?.fetched_at);
    expect(transport).toHaveBeenCalledTimes(3);
    now += 24 * 60 * 60 * 1000;
    await source.get('test-game');
    expect(transport).toHaveBeenCalledTimes(4);
    await source.get('test-game', false, true);
    expect(transport).toHaveBeenCalledTimes(5);
  });

  it('bounds cached search pages', async () => {
    const transport = vi.fn(async () => ({ status: 200, text: searchHtml }));
    const source = new GameSource(transport, { sleep: noWait });
    for (let i = 0; i < 129; i++) await source.search(`q${i}`);
    await source.search('q0');
    expect(transport).toHaveBeenCalledTimes(130);
  });

  it('accepts edition slugs but rejects foreign or malformed identifiers before transport', async () => {
    const transport = vi.fn(async (_url: string) => ({ status: 200, text: gameHtml }));
    const source = new GameSource(transport, { sleep: noWait });
    await source.get('https://gamesneverdie.com/ja/games/test-game-deluxe/');
    expect(transport.mock.calls[0]?.[0]).toBe(
      'https://gamesneverdie.com/ja/games/test-game-deluxe',
    );
    for (const id of [
      '../secret',
      'test/game',
      'https://evil.com/ja/games/x',
      'https://gamesneverdie.com.evil.example/ja/games/x',
      'https://evil@gamesneverdie.com/ja/games/x',
      'https://user:pw@gamesneverdie.com/ja/games/x',
      'http://gamesneverdie.com/ja/games/x',
      'https://gamesneverdie.com/ja/games/x?q=1',
    ]) {
      await expect(source.get(id)).rejects.toThrow(/Expected a game slug/);
    }
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('reports blocked, rate limited, timeout and malformed responses without retry or cache', async () => {
    for (const status of [403, 429]) {
      const transport = vi.fn(async () => ({ status, text: '' }));
      const source = new GameSource(transport);
      await expect(source.get('x')).rejects.toThrow(`HTTP ${status}`);
      expect(transport).toHaveBeenCalledTimes(1);
    }
    const transport = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ status: 200, text: '<h1>Blocked</h1>' })
      .mockResolvedValueOnce({ status: 200, text: gameHtml });
    const source = new GameSource(transport, { sleep: noWait });
    await expect(source.get('x')).rejects.toThrow(/timeout/);
    await expect(source.get('x')).rejects.toThrow(/Expected game/);
    expect((await source.get('x')).title).toBe('Test & Game');
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it('fetches typed Steam data only on request and rejects changed JSON shape', async () => {
    const transport = vi.fn(async (url: string) => ({
      status: 200,
      text: url.includes('/api/steam?') ? steamJson : gameHtml,
    }));
    const source = new GameSource(transport, { sleep: noWait });
    expect((await source.get('test-game')).steam).toBeNull();
    const game = await source.get('test-game', true);
    expect(game.steam?.players).toBe(7);
    expect(game.steam?.price?.formatted).toBe('¥100');
    expect(transport).toHaveBeenCalledTimes(2);
    expect((await source.get('test-game')).steam).toBeNull();
    const invalid = new GameSource(
      async (url) => ({
        status: 200,
        text: url.includes('/api/steam?') ? '{"players":7}' : gameHtml,
      }),
      { sleep: noWait },
    );
    await expect(invalid.get('test-game', true)).rejects.toThrow(/unexpected response shape/);
  });

  it('extracts a Steam app ID when the query follows it directly', async () => {
    const html = gameHtml.replace(
      'https://store.steampowered.com/app/123/Test?l=japanese',
      'https://store.steampowered.com/app/1245620?l=japanese',
    );
    const transport = vi.fn(async (url: string) => ({
      status: 200,
      text: url.includes('/api/steam?') ? steamJson : html,
    }));
    const source = new GameSource(transport, { sleep: noWait });
    expect((await source.get('elden-ring', true)).steam?.players).toBe(7);
    expect(transport.mock.calls.map((call) => call[0])).toContain(
      'https://gamesneverdie.com/api/steam?appid=1245620&loc=ja',
    );
  });

  it('ignores Steam lookalike hosts and credential URLs', async () => {
    for (const href of [
      'https://store.steampowered.com.evil.example/app/1245620?l=japanese',
      'https://store.steampowered.com@evil.example/app/1245620?l=japanese',
      'https://evil@store.steampowered.com/app/1245620?l=japanese',
    ]) {
      const html = gameHtml.replace('https://store.steampowered.com/app/123/Test?l=japanese', href);
      const transport = vi.fn(async () => ({ status: 200, text: html }));
      const source = new GameSource(transport, { sleep: noWait });
      expect((await source.get('test-game', true)).steam).toBeNull();
      expect(transport).toHaveBeenCalledTimes(1);
    }
  });
});
