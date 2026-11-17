import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Game, type ShelfSettings } from '../src/domain';
import {
  JOURNAL_MARKER,
  appendSession,
  changesFor,
  filename,
  gameId,
  libraryItem,
  markdownText,
  parseSettings,
  patchProperties,
  renderBody,
  renderNote,
  sourceBody,
  sourceMetadata,
  validateMapping,
  vaultPath,
} from '../src/note-format';

function game(overrides: Partial<Game> = {}): Game {
  return {
    source: 'gamesneverdie',
    id: 'test-game',
    dataLanguage: 'ja',
    slug: 'test-game',
    url: 'https://gamesneverdie.com/ja/games/test-game',
    title: 'Test Game',
    description: 'A secret ending.',
    developers: ['Studio A'],
    publishers: ['Publisher'],
    directors: [],
    release_date: '2025-02-03',
    release_date_scope: 'JP',
    release_dates: [{ date: '2025-02-03', scope: 'JP' }],
    platforms: ['PC'],
    tags: ['Adventure'],
    age_rating: null,
    status: null,
    ratings: { igdb: 89.5, steam: 95 },
    cover_url: null,
    hero_url: null,
    screenshots: [],
    trailers: [],
    stores: [{ store: 'steam', name: 'Steam', url: 'https://store.steampowered.com/app/123/' }],
    articles: [
      {
        title: 'Ending explained',
        url: 'https://example.com/article',
        source: 'Example',
        date: '2025-02-04',
        category: 'Guide',
        summary: 'Spoiler',
      },
    ],
    related: [],
    updated_at: '2025-02-05',
    fetched_at: '2025-02-06T00:00:00.000Z',
    steam: null,
    ...overrides,
  };
}

const settings = (): ShelfSettings => structuredClone(DEFAULT_SETTINGS);

describe('paths and filenames', () => {
  it('normalizes normal vault folders and rejects traversal, hidden segments and absolute paths', () => {
    expect(vaultPath(' Games\\JRPG/ ')).toBe('Games/JRPG');
    expect(vaultPath(' ', true)).toBe('');
    for (const path of [
      '../outside',
      'Games/../outside',
      'Games\\..\\outside',
      '.obsidian',
      'Games/.hidden',
      '/absolute',
      'Games//nested',
      'Games:bad',
      'Games\u0000bad',
    ]) {
      expect(() => vaultPath(path)).toThrow();
    }
    expect(() => vaultPath(' ')).toThrow();
  });

  it('strips reserved filename characters and rejects invalid or empty tokens', () => {
    const item = game({ title: 'CON: Episode / 2? # [Deluxe]' });
    expect(filename('{{title}}', item)).toBe('CON Episode 2 Deluxe');
    expect(filename('{{title}}', game({ title: 'CON' }))).toBe('Game CON');
    expect(filename('{{slug}}-{{year}}-{{platform}}', item)).toBe('test-game-2025-PC');
    expect(() => filename('{{unknown}}', item)).toThrow(/Unknown filename token/);
    expect(() => filename('...', item)).toThrow(/filename is empty/);
  });

  it('makes normalized filename collisions visible to the pure caller', () => {
    const first = filename('{{title}}', game({ title: 'A/B' }));
    const second = filename('{{title}}', game({ title: 'A:B' }));
    expect(first).toBe('A B');
    expect(second).toBe(first);
  });
});

describe('mapping and source metadata', () => {
  it('keeps the provider ID stable when a localized title or slug changes', () => {
    const first = game({ source: 'igdb', id: '1942', slug: 'example-game', dataLanguage: 'en' });
    const renamed = { ...first, title: '別の表示名', slug: 'new-slug' };
    expect(gameId(first)).toBe('igdb:1942');
    expect(gameId(renamed)).toBe(gameId(first));
    const metadata = sourceMetadata(first, [], settings());
    expect(metadata).toMatchObject({
      game_id: 'igdb:1942', game_source: 'igdb', source_id: '1942',
      game_slug: 'example-game', metadata_language: 'en',
    });
    expect(metadata).not.toHaveProperty('note_language');
  });

  it('projects both providers and mapped per-note languages without guessing from the source', () => {
    const custom = parseSettings({ propertyNames: { note_language: 'writing_language' } });
    const english = libraryItem('Games/Example.md', 0, {
      game_id: 'igdb:1942', game_slug: 'human-readable', writing_language: 'ja',
    }, custom);
    expect(english).toMatchObject({ source: 'igdb', sourceId: '1942', noteLanguage: 'ja' });
    const legacy = libraryItem('Games/Legacy.md', 0, { game_id: 'gnd:legacy' }, custom);
    expect(legacy).toMatchObject({ source: 'gamesneverdie', sourceId: 'legacy', noteLanguage: null });
    expect(libraryItem('Other.md', 0, { game_id: 'unrelated:example' }, custom)).toBeNull();
  });

  it('keeps UI language, note language, provider and secret references independent in settings', () => {
    expect(parseSettings(null).online).toBe(true);
    expect(parseSettings({ online: false }).online).toBe(false);
    const saved = parseSettings({
      language: 'ja', noteLanguage: 'en', provider: 'igdb',
      igdbClientId: ' publicclient ', igdbClientSecret: 'game-shelf-secret',
    });
    expect(saved).toMatchObject({
      language: 'ja', noteLanguage: 'en', provider: 'igdb',
      igdbClientId: 'publicclient', igdbClientSecret: 'game-shelf-secret',
    });
    expect(parseSettings({ language: 'ja' })).toMatchObject({ noteLanguage: 'auto', provider: 'auto' });
    expect(parseSettings({ noteLanguage: 'fr', provider: 'other' })).toMatchObject({ noteLanguage: 'auto', provider: 'auto' });
  });
  it('rejects unknown, protected, duplicate and invalid property mappings', () => {
    expect(validateMapping({ rating: 'my_score', status: 'play_status' })).toEqual({
      rating: 'my_score',
      status: 'play_status',
    });
    for (const mapping of [
      { unknown: 'x' },
      { title: 'status' },
      { game_id: 'same', title: 'same' },
      { title: '__proto__' },
      { title: 'bad key' },
      { title: 'constructor' },
    ])
      expect(() => validateMapping(mapping)).toThrow();
  });

  it('maps selected source fields while keeping personal properties untouched', () => {
    const custom = settings();
    custom.propertyNames = { title: 'source_title', status: 'play_status', tags: 'my_tags' };
    const metadata = sourceMetadata(game(), ['basics', 'ratings'], custom);
    expect(metadata.source_title).toBe('Test Game');
    expect(metadata.release_dates).toEqual(['JP: 2025-02-03']);
    expect(metadata.igdb_score).toBe(89.5);
    expect(metadata.genres).toEqual(['Adventure']);
    for (const personal of [
      'play_status',
      'my_tags',
      'rating',
      'ownership',
      'started',
      'finished',
      'playtime_minutes',
    ]) {
      expect(metadata).not.toHaveProperty(personal);
    }
    expect(sourceMetadata(game(), [], custom)).not.toHaveProperty('genres');
  });

  it('preserves a custom status through settings and library projection', () => {
    const custom = parseSettings({
      statuses: ['backlog', 'replaying', 'replaying'],
      propertyNames: { status: 'play_status' },
    });
    expect(custom.statuses).toEqual(['backlog', 'replaying']);
    const item = libraryItem(
      'Games/Test.md',
      123,
      { game_id: 'gnd:test-game', play_status: 'replaying', title: 'Test' },
      custom,
    );
    expect(item?.status).toBe('replaying');
    expect(item?.title).toBe('Test');
  });
});

describe('refresh preview', () => {
  it('detects edits since baseline, leaves unchanged fields out and protects personal names', () => {
    const incoming = { title: 'New title', release_date: '2025-02-03', igdb_score: 95 };
    const baseline = { title: 'Old title', release_date: '2025-02-02', igdb_score: 80 };
    const current = {
      title: 'My title',
      release_date: '2025-02-02',
      igdb_score: 95,
      status: 'replaying',
    };
    expect(changesFor(current, incoming, baseline, settings())).toEqual([
      { key: 'title', before: 'My title', after: 'New title', conflict: true },
      { key: 'release_date', before: '2025-02-02', after: '2025-02-03', conflict: false },
    ]);
    expect(current.status).toBe('replaying');
    expect(() => changesFor(current, { status: 'completed' }, baseline, settings())).toThrow(
      /personal property/,
    );
  });

  it('flags arbitrary existing values and unknown baselines as conflicts', () => {
    const current = { platforms: { unexpected: 'mapping' }, title: ['custom', 'list'] };
    expect(
      changesFor(current, { platforms: ['PC'], title: 'From source' }, undefined, settings()),
    ).toEqual([
      { key: 'platforms', before: current.platforms, after: ['PC'], conflict: true },
      { key: 'title', before: current.title, after: 'From source', conflict: true },
    ]);
  });
});

describe('safe note rendering', () => {
  it('keeps hostile metadata and title data without leaving raw script or Templater openers', () => {
    const hostile = '<script>alert(1)</script><% tp.file.rename("x") %>';
    const note = renderNote(
      { title: hostile, game_id: 'gnd:test-game' },
      renderBody('# {{title}}\n{{source}}', { title: markdownText(hostile), source: '' }),
    );
    expect(note).not.toContain('<script');
    expect(note).not.toContain('<%');
    expect(note).toContain('\\u003cscript');
    expect(note).toContain('&lt;script');
    expect(note).toContain('tp.file.rename');
  });

  it('escapes source description and article title while preserving their readable text', () => {
    const hostile = '<%* tp.file.rename("x") %> <script>alert(1)</script> `code`';
    const body = sourceBody(
      game({ description: hostile, articles: [{ ...game().articles[0]!, title: hostile }] }),
      ['description', 'articles'],
      'Source',
    );
    expect(body).not.toContain('<%');
    expect(body).not.toContain('<script');
    expect(body).toContain('&lt;%\\*');
    expect(body).toContain('tp.file.rename');
    expect(body).toContain('\\`code\\`');
  });

  it('keeps provider description paragraphs as inert text', () => {
    const body = sourceBody(
      game({ description: 'First ![x](https://unapproved-host/image.png) and [link](https://unapproved-host/)\r\n\r\n<% tp.file.rename("x") %>\n<script>alert(1)</script>' }),
      ['description'],
      'Source',
    );
    expect(body).toContain('First \\!\\[x\\](https://unapproved-host/image.png) and \\[link\\](https://unapproved-host/)\n\n&lt;% tp.file.rename("x") %&gt;\n&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(body).not.toMatch(/(?<!\\)!\[[^\]]*\]\(https:\/\/unapproved-host/);
    expect(body).not.toContain('<%');
    expect(body).not.toContain('<script');
  });

  it('escapes hostile article dates and Steam prices without losing their text', () => {
    const hostile = '<%* tp.file.rename("x") %>';
    const sample = game({
      articles: [{ ...game().articles[0]!, date: hostile }],
      steam: {
        players: 7,
        playersBase: false,
        review: null,
        reviewLocal: null,
        price: { free: false, formatted: hostile, initialFormatted: null, discount: 0 },
        history: null,
        fetched_at: '2025-02-06T00:00:00.000Z',
      },
    });
    const body = sourceBody(sample, ['articles', 'steam'], 'Source');
    expect(body).not.toContain('<%');
    expect(body.match(/&lt;%/g)).toHaveLength(2);
    expect(body.match(/tp\.file\.rename/g)).toHaveLength(2);
  });

  it('substitutes template tokens once and rejects unknown tokens', () => {
    expect(
      renderBody('{{title}} | {{source}}', { title: '{{source}}', source: 'Source text' }),
    ).toBe('{{source}} | Source text\n');
    expect(() => renderBody('{{surprise}}', { title: 'Test' })).toThrow(/Unknown template token/);
  });

  it('embeds screenshots by default while keeping trailers as links and text spoilers opt-in', () => {
    const body = sourceBody(
      game({
        screenshots: [
          'https://media.gamesneverdie.com/first.webp',
          'https://media.gamesneverdie.com/second (1).webp',
        ],
        trailers: ['https://www.youtube.com/watch?v=test'],
      }),
      DEFAULT_SETTINGS.groups,
      'Game information',
    );
    expect(body).toContain('Steam');
    expect(body).toContain('- [Trailer 1](<https://www.youtube.com/watch?v=test>)');
    expect(body).toContain(
      '\n\n![Screenshot 1](<https://media.gamesneverdie.com/first.webp>)\n\n![Screenshot 2](<https://media.gamesneverdie.com/second%20(1).webp>)',
    );
    expect(body).not.toContain('secret ending');
    expect(body).not.toContain('Ending explained');
    expect(body).not.toContain('Spoiler');
  });

  it('writes localized media labels and preserves the original provider prose', () => {
    const body = sourceBody(game({
      source: 'igdb', id: '42', dataLanguage: 'en',
      description: 'English source text.',
      screenshots: ['https://images.igdb.com/igdb/image/upload/t_screenshot_huge/example.jpg'],
      trailers: ['https://www.youtube.com/watch?v=video'],
    }), ['description', 'media'], 'ゲーム情報', 'ja');
    expect(body).toContain('## ゲーム情報');
    expect(body).toContain('[IGDB]');
    expect(body).toContain('English source text.');
    expect(body).toContain('[予告編 1]');
    expect(body).toContain('![スクリーンショット 1]');
    expect(body).not.toContain('Games Never Die');
    expect(appendSession(JOURNAL_MARKER, '2026-11-17', '記録', 12, 'ja')).toContain('12 分');
    expect(appendSession(JOURNAL_MARKER, '2026-11-17', 'A note', 12, 'en')).toContain('12 min');
  });

  it('omits screenshot embeds and trailer links when media is disabled', () => {
    const body = sourceBody(
      game({
        screenshots: ['https://media.gamesneverdie.com/first.webp'],
        trailers: ['https://www.youtube.com/watch?v=test'],
      }),
      ['basics', 'stores'],
      'Game information',
    );
    expect(body).not.toContain('Screenshot');
    expect(body).not.toContain('Trailer');
  });
});

describe('frontmatter patching', () => {
  it('updates one scalar while preserving head, inline and end comments plus other formatting and aliases', () => {
    const original = [
      '# User heading',
      'status: &state playing # keep status comment',
      'status_copy: *state',
      "custom: 'keep my quotes'",
      'notes: |-',
      '  first line',
      '  second line',
      'rating: 3 # my rating',
      '# User footer',
    ].join('\n');
    const result = patchProperties(original, (properties) => {
      properties.rating = 4;
    });
    expect(result).toContain('# User heading');
    expect(result).toContain('rating: 4 # my rating');
    expect(result).toContain('# User footer');
    expect(result).toContain('status: &state playing # keep status comment');
    expect(result).toContain('status_copy: *state');
    expect(result).toContain("custom: 'keep my quotes'");
    expect(result).toContain('notes: |-\n  first line\n  second line');
  });

  it('does not rewrite unchanged values or aliases', () => {
    const original = 'status: &state playing\nstatus_copy: *state\nrating: 3\n';
    const result = patchProperties(original, (properties) => {
      properties.rating = 3;
    });
    expect(result).toBe(original.trimEnd());
  });

  it('refuses malformed, duplicate-key and non-mapping YAML before updating', () => {
    for (const yaml of [
      'status: [unterminated',
      'status: playing\nstatus: backlog',
      '- one\n- two',
      'plain scalar',
    ]) {
      expect(() =>
        patchProperties(yaml, (properties) => {
          properties.rating = 4;
        }),
      ).toThrow();
    }
  });
});

describe('journal and settings', () => {
  it('appends a session without changing earlier journal or freeform text', () => {
    const original = `My thoughts\n\n${JOURNAL_MARKER}\n\n### 2025-01-01\n\nEarlier entry\n`;
    const result = appendSession(original, '2025-02-02', 'New thoughts', 45);
    expect(result).toContain('My thoughts\n\n');
    expect(result).toContain('### 2025-02-02 · 45 min\n\nNew thoughts');
    expect(result).toContain('### 2025-01-01\n\nEarlier entry\n');
    expect(result.match(/<!-- game-shelf:journal -->/g)).toHaveLength(1);
  });

  it('rejects missing marker, blank notes and invalid playtime, and neutralizes pasted markers', () => {
    expect(() => appendSession('plain note', '2025-02-02', 'Hello', null)).toThrow(
      /marker is missing/,
    );
    expect(() => appendSession(JOURNAL_MARKER, '2025-02-02', '  ', null)).toThrow(/session note/);
    for (const minutes of [-1, 1441, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => appendSession(JOURNAL_MARKER, '2025-02-02', 'Hello', minutes)).toThrow(
        /Minutes/,
      );
    }
    expect(
      appendSession(JOURNAL_MARKER, '2025-02-02', JOURNAL_MARKER, null).match(
        /<!-- game-shelf:journal -->/g,
      ),
    ).toHaveLength(1);
  });

  it('loads defaults independently and validates persisted paths, mappings and tokens', () => {
    const first = parseSettings(undefined);
    first.groups.push('articles');
    expect(parseSettings(undefined).groups).not.toContain('articles');
    const loaded = parseSettings({
      folder: ' Games\\JRPG ',
      coverFolder: 'Covers',
      online: true,
      groups: ['basics', 'bogus'],
      statuses: ['replaying'],
      propertyNames: { rating: 'my_score' },
    });
    expect(loaded.folder).toBe('Games/JRPG');
    expect(loaded.groups).toEqual(['basics']);
    expect(loaded.statuses).toEqual(['replaying']);
    expect(loaded.propertyNames.rating).toBe('my_score');
    for (const raw of [
      { folder: '../outside' },
      { coverFolder: '.obsidian' },
      { filename: '{{unknown}}' },
      { template: '{{unknown}}' },
      { propertyNames: { title: 'status' } },
    ]) {
      expect(() => parseSettings(raw)).toThrow();
    }
  });
});
