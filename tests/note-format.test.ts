import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Game, type ShelfSettings } from '../src/domain';
import {
  JOURNAL_MARKER,
  appendSession,
  changesFor,
  filename,
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
    expect(body).toContain('&lt;%*');
    expect(body).toContain('tp.file.rename');
    expect(body).toContain('&#96;code&#96;');
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

  it('excludes description, articles and media spoilers from default source block', () => {
    const body = sourceBody(game(), DEFAULT_SETTINGS.groups, 'Game information');
    expect(body).toContain('Steam');
    expect(body).not.toContain('secret ending');
    expect(body).not.toContain('Ending explained');
    expect(body).not.toContain('Spoiler');
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
    first.groups.push('media');
    expect(parseSettings(undefined).groups).not.toContain('media');
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
