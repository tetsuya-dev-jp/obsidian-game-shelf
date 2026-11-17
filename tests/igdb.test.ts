import { describe, expect, it, vi } from 'vitest';
import { IgdbError, IgdbSource } from '../src/igdb';
import { LocalizedError } from '../src/translations';

const row = {
  id: 42, name: 'Example', slug: 'example', summary: '<b>Hello</b> world', rating: 89.5,
  cover: { url: '//images.igdb.com/igdb/image/upload/t_thumb/a.jpg' },
  artworks: [{ url: 'https://images.igdb.com/igdb/image/upload/t_thumb/art.jpg' }],
  screenshots: [{ url: 'https://images.igdb.com.evil.example/igdb/image/upload/t_thumb/bad.jpg' },
    { url: '//images.igdb.com/igdb/image/upload/t_thumb/shot.jpg' }],
  videos: [{ video_id: 'trailer-1' }, { video_id: 'bad/id' }],
  platforms: [{ name: 'PC' }], genres: [{ name: 'Adventure' }],
  involved_companies: [{ developer: true, company: { name: 'Studio' } }],
  release_dates: [{ y: 2026, m: 11, date_format: { format: 'YYYYMMMM' }, release_region: { region: 'Japan' }, platform: { name: 'PC' } }, { y: 2027, date_format: { format: 'YYYY' } }],
  websites: [{ url: 'https://store.example/game' }, { url: 'http://unsafe.example/game' }],
};
const auth = { status: 200, text: JSON.stringify({ access_token: 'token', expires_in: 3600 }) };
const game = { status: 200, text: JSON.stringify([row]) };
const noWait = async (): Promise<void> => {};
function setup(response = game) {
  const requests: { url: string; method: string; headers: Record<string, string>; body: string }[] = [];
  const transport = vi.fn(async (request: (typeof requests)[number]) => {
    requests.push(request);
    if (request.url.includes('oauth2/token')) return auth;
    if (request.url.endsWith('/count')) return { status: 200, text: '{"count":21}' };
    return response;
  });
  const source = new IgdbSource(transport, () => ({ clientId: 'client', clientSecret: 'private' }), { sleep: noWait });
  return { source, requests, transport };
}

describe('IgdbSource', () => {
  it('maps game facts, partial dates, media and HTTPS stores without invented fields', async () => {
    const { source, requests } = setup();
    const result = await source.get('42', true);
    expect(result).toMatchObject({ source: 'igdb', id: '42', slug: 'example', dataLanguage: 'en',
      title: 'Example', description: 'Hello world', release_date: '2026-11', release_date_scope: 'Japan / PC',
      ratings: { igdb: 89.5, steam: null }, developers: ['Studio'], platforms: ['PC'], articles: [], steam: null });
    expect(result.release_dates).toEqual([{ date: '2026-11', scope: 'Japan / PC' }, { date: '2027', scope: null }]);
    expect(result.cover_url).toBe('https://images.igdb.com/igdb/image/upload/t_cover_big/a.jpg');
    expect(result.hero_url).toBe('https://images.igdb.com/igdb/image/upload/t_screenshot_huge/art.jpg');
    expect(result.screenshots).toEqual(['https://images.igdb.com/igdb/image/upload/t_screenshot_huge/shot.jpg']);
    expect(result.trailers).toEqual(['https://www.youtube.com/watch?v=trailer-1']);
    expect(result.stores).toHaveLength(1);
    expect(requests[0]?.url).toBe('https://id.twitch.tv/oauth2/token');
    expect(requests[0]?.url).not.toContain('private');
    expect(requests[0]?.body).toContain('client_secret=private');
    expect(requests[1]?.body).toContain('where id = 42');
    expect(requests[1]?.body).toContain('release_dates.release_region.region');
    expect(requests[1]?.body).toContain('release_dates.date_format.format');
    expect(requests[1]?.body).not.toContain('release_region.name');
  });

  it('uses cover size for search results and leaves untrusted artwork URLs out', async () => {
    const { source } = setup();
    const result = await source.search('Example');
    expect(result.items[0]?.cover_url).toBe('https://images.igdb.com/igdb/image/upload/t_cover_big/a.jpg');
    expect(result.items[0]?.cover_url).not.toContain('t_thumb');
  });

  it('uses documented nested fields in search and detail requests', async () => {
    const calls: string[] = [];
    const source = new IgdbSource(async (request) => {
      if (request.url.includes('/token')) return auth;
      if (request.url.endsWith('/count')) return { status: 200, text: '{"count":1}' };
      calls.push(request.body);
      if (request.body.includes('release_region.name') || request.body.includes('date_format.name'))
        return { status: 400, text: 'Invalid nested field' };
      return game;
    }, () => ({ clientId: 'client', clientSecret: 'secret' }), { sleep: noWait });
    await expect(source.search('Example')).resolves.toMatchObject({ items: [{ id: '42' }] });
    await expect(source.get('42')).resolves.toMatchObject({ release_date_scope: 'Japan / PC' });
    expect(calls).toHaveLength(2);
    expect(calls.every((body) => body.includes('release_dates.release_region.region') && body.includes('release_dates.date_format.format'))).toBe(true);
  });

  it('reports a rejected API schema as a sanitized response error', async () => {
    const transport = vi.fn(async (request: { url: string }) => request.url.includes('/token')
      ? auth : { status: 400, text: 'Invalid field release_region.name; secret=private' });
    const source = new IgdbSource(transport, () => ({ clientId: 'client', clientSecret: 'private' }), { sleep: noWait });
    await expect(source.get('42')).rejects.toEqual(new IgdbError('response'));
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('sorts out-of-order dates by known lower bound without inventing day precision', async () => {
    const release_dates = [
      { y: 2028, m: 12, d: 31, date_format: { format: 'TBD' }, human: 'TBD' },
      { y: 2027, m: 12, d: 31, date_format: { format: 'YYYYQ2' }, human: 'Q2 2027', release_region: { region: 'Europe' } },
      { y: 2026, m: 12, d: 31, date_format: { format: 'YYYY' }, release_region: { region: 'Japan' } },
      { y: 2027, m: 5, d: 31, date_format: { format: 'YYYYMMMM' } },
      { y: 2027, m: 2, d: 3, date_format: { format: 'YYYYMMMMDD' } },
      { y: 2027, m: 8, d: 31, date_format: { format: 'YYYYQ3' } },
    ];
    const { source } = setup({ status: 200, text: JSON.stringify([{ ...row, release_dates }]) });
    const result = await source.get('42');
    expect(result.release_dates).toEqual([
      { date: '2026', scope: 'Japan' },
      { date: '2027-02-03', scope: null },
      { date: 'Q2 2027', scope: 'Europe' },
      { date: '2027-05', scope: null },
      { date: '2027 Q3', scope: null },
      { date: 'TBD', scope: null },
    ]);
    expect([result.release_date, result.release_date_scope]).toEqual(['2026', 'Japan']);
  });

  it('uses immutable IDs and canonical URL slugs, with cache and concurrent dedup', async () => {
    const { source, transport } = setup();
    const [first, second] = await Promise.all([source.get('42'), source.get('42')]);
    expect(first).toEqual(second);
    expect(transport).toHaveBeenCalledTimes(2);
    await source.get('42');
    expect(transport).toHaveBeenCalledTimes(2);
    const byUrl = await source.get('https://www.igdb.com/games/example');
    expect(byUrl.id).toBe('42');
    expect(transport.mock.calls.at(-1)?.[0].body).toContain('where slug = "example"');
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it('rejects unsafe identifiers before transport', async () => {
    const { source, transport } = setup();
    for (const value of ['0', '../x', 'https://evil.example/games/example', 'https://www.igdb.com.evil.example/games/example',
      'https://evil@www.igdb.com/games/example', 'https://www.igdb.com/games/example?q=1', 'http://www.igdb.com/games/example']) {
      await expect(source.get(value)).rejects.toMatchObject({ code: 'identifier' });
    }
    expect(transport).not.toHaveBeenCalled();
  });

  it('escapes search text and returns exact count and page offset', async () => {
    const { source, requests } = setup();
    const result = await source.search('x"; where id > 0; //', 2);
    expect(result).toMatchObject({ total: 21, total_pages: 2, page: 2, items: [{ source: 'igdb', id: '42' }] });
    expect(requests[1]?.body).toContain('search "x\\"; where id > 0; //";');
    expect(requests[2]?.body).toContain('offset 20;');
    expect(requests[2]?.body).toContain('limit 20;');
  });

  it('expires tokens and rotates credentials without retaining cached games', async () => {
    let now = 1000;
    let secret = 'one';
    let serial = 0;
    const calls: string[] = [];
    const source = new IgdbSource(async (request) => {
      calls.push(request.url);
      if (request.url.includes('/token')) return { status: 200, text: JSON.stringify({ access_token: `token${++serial}`, expires_in: 2 }) };
      return game;
    }, () => ({ clientId: 'client', clientSecret: secret }), { now: () => now, sleep: noWait });
    await source.get('42');
    now += 2000;
    await source.get('example');
    secret = 'two';
    await source.get('42');
    expect(calls.filter((url) => url.includes('/token'))).toHaveLength(3);
    expect(calls.filter((url) => url.endsWith('/games'))).toHaveLength(3);
  });

  it('spaces authentication and API requests at 250 ms intervals', async () => {
    let now = 0;
    const starts: number[] = [];
    const source = new IgdbSource(async (request) => {
      starts.push(now);
      return request.url.includes('/token') ? auth : game;
    }, () => ({ clientId: 'client', clientSecret: 'secret' }), {
      now: () => now, sleep: async (ms) => { now += ms; },
    });
    await Promise.all([source.get('42'), source.get('example', false, true)]);
    expect(starts).toEqual([0, 250, 500]);
  });

  it('validates credentials and the connection count response', async () => {
    const missing = new IgdbSource(async () => auth, () => ({ clientId: '', clientSecret: '' }));
    await expect(missing.testConnection()).rejects.toMatchObject({ code: 'credentials' });
    const { source } = setup();
    await expect(source.testConnection()).resolves.toBeUndefined();
  });

  it('refreshes once on 401, never retries 429, and sanitizes network errors', async () => {
    let gameCalls = 0;
    const source = new IgdbSource(async (request) => request.url.includes('/token') ? auth :
      ++gameCalls === 1 ? { status: 401, text: '' } : game,
    () => ({ clientId: 'client', clientSecret: 'secret' }), { sleep: noWait });
    expect((await source.get('42')).id).toBe('42');
    expect(gameCalls).toBe(2);
    const limited = new IgdbSource(async (request) => request.url.includes('/token') ? auth : { status: 429, text: 'secret' },
      () => ({ clientId: 'client', clientSecret: 'secret' }), { sleep: noWait });
    await expect(limited.get('42')).rejects.toMatchObject({ code: 'rateLimit' });
    const broken = new IgdbSource(async () => { throw new Error('secret leaked'); },
      () => ({ clientId: 'client', clientSecret: 'secret' }), { sleep: noWait });
    await expect(broken.get('42')).rejects.toEqual(new IgdbError('network'));
    const offline = new IgdbSource(async () => { throw new LocalizedError('offline'); },
      () => ({ clientId: 'client', clientSecret: 'secret' }), { sleep: noWait });
    await expect(offline.get('42')).rejects.toBeInstanceOf(LocalizedError);
  });

  it('rejects malformed roots and required game fields', async () => {
    for (const text of ['{}', '[{"id":42}]', '[{"id":"42","name":"Bad","slug":"bad"}]']) {
      const { source } = setup({ status: 200, text });
      await expect(source.get('42')).rejects.toMatchObject({ code: 'response' });
    }
    const { source } = setup({ status: 200, text: '[]' });
    await expect(source.get('42')).rejects.toMatchObject({ code: 'notFound' });
  });
});
