// Runs against a dedicated vault created by launch.mjs; never against a personal vault.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { connect } from './cdp.mjs';

const state = JSON.parse(
  await readFile(new URL('./.runtime/launcher.json', import.meta.url), 'utf8'),
);
assert(
  state.vaultPath.endsWith('/obsidian-game-shelf/e2e/.runtime/vault'),
  'Unexpected test vault',
);
const c = await connect();
const report = { date: new Date().toISOString(), app: null, checks: [] };
const evaluate = (fn, ...args) =>
  c.evaluate(`(${fn.toString()})(${args.map((x) => JSON.stringify(x)).join(',')})`, {
    timeoutMs: 60000,
  });
async function check(name, fn) {
  const details = await fn();
  report.checks.push({ name, status: 'pass', details });
  console.log(`PASS ${name}`);
}
async function until(expression, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await c.evaluate(expression)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timed out: ${expression}`);
}
let savedSettings;
try {
  report.app = await c.evaluate(
    `({version:document.title.match(/Obsidian ([0-9.]+)/)?.[1],userAgent:navigator.userAgent})`,
  );
  await check('native plugin loaded and isolated', async () => {
    const data = await c.evaluate(
      `({loaded:!!app.plugins.plugins['game-shelf'],vault:app.vault.adapter.basePath})`,
    );
    assert(data.loaded);
    assert.equal(data.vault, state.vaultPath);
    return data;
  });
  savedSettings = await c.evaluate(`structuredClone(app.plugins.plugins['game-shelf'].settings)`);
  await check('manual creation and collision safety work offline', async () =>
    evaluate(async () => {
      const p = app.plugins.plugins['game-shelf'];
      await p.updateSettings({ ...p.settings, online: false, folder: 'E2E checks' });
      const options = {
        title: 'E2E: Path / Safety?',
        status: 'replaying',
        rating: 4.5,
        ownership: 'owned',
        groups: [],
        saveCover: false,
      };
      const first = await p.notes.manual(options);
      const second = await p.notes.manual(options);
      if (first.file.path === second.file.path)
        throw new Error('Filename collision overwrote a note');
      const content = await app.vault.read(first.file);
      if (!content.includes('game-shelf:journal') || !content.includes('replaying'))
        throw new Error('Manual content missing');
      const paths = [first.file.path, second.file.path];
      await app.fileManager.trashFile(first.file);
      await app.fileManager.trashFile(second.file);
      return { paths, distinct: true, networkEnabled: p.settings.online };
    }),
  );
  if (process.argv.includes('--live')) {
    await evaluate(async () => {
      const p = app.plugins.plugins['game-shelf'];
      await p.updateSettings({ ...p.settings, online: true, folder: 'Games' });
      await p.openShelf('discover');
    });
    await check('live search through visible UI distinguishes editions', async () => {
      await evaluate(() => {
        const input = document.querySelector('.gs-search-form input');
        input.focus();
        input.value = '時のオカリナ';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        document
          .querySelector('.gs-search-form')
          .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      await until(`document.querySelectorAll('.gs-result').length>=2`);
      const results = await c.evaluate(
        `[...document.querySelectorAll('.gs-result')].map(e=>e.textContent)`,
      );
      assert(results.some((x) => x.includes('1998')));
      assert(results.some((x) => x.includes('2026')));
      return { results: results.length, originalAndRemake: true };
    });
    await check('keyboard navigation reaches the selected game', async () => {
      await evaluate(() => {
        const buttons = [...document.querySelectorAll('.gs-result')];
        buttons[0].focus();
        buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      });
      const index = await c.evaluate(
        `[...document.querySelectorAll('.gs-result')].indexOf(document.activeElement)`,
      );
      assert.equal(index, 1);
      await evaluate(() =>
        [...document.querySelectorAll('.gs-result')]
          .find((x) => x.textContent.includes('2026'))
          .click(),
      );
      await until(`!!document.querySelector('.gs-detail-hero')`);
      return { arrowDownFocus: index, detailLoaded: true };
    });
    await check('duplicate import leaves existing Markdown byte-for-byte intact', async () =>
      evaluate(async () => {
        const p = app.plugins.plugins['game-shelf'];
        const game = await p.source.get('the-legend-of-zelda-ocarina-of-time--1');
        const options = {
          title: game.title,
          status: 'backlog',
          rating: null,
          ownership: 'owned',
          groups: p.settings.groups,
          saveCover: true,
        };
        const original = p.notes.find(`gnd:${game.slug}`);
        if (!original) throw new Error('Seed the example game first');
        const before = await app.vault.read(original);
        const result = await p.notes.create(game, options);
        const after = await app.vault.read(original);
        if (!result.existing || before !== after)
          throw new Error('Duplicate changed existing note');
        return { existing: true, path: result.file.path, preserved: true };
      }),
    );
    await check('same-title editions get distinct notes without overwrite', async () =>
      evaluate(async () => {
        const p = app.plugins.plugins['game-shelf'];
        const game = await p.source.get('the-legend-of-zelda-ocarina-of-time');
        const remake = p.notes.find('gnd:the-legend-of-zelda-ocarina-of-time--1');
        const before = await app.vault.read(remake);
        const result = await p.notes.create(game, {
          title: game.title,
          status: 'backlog',
          rating: null,
          ownership: 'owned',
          groups: ['basics'],
          saveCover: true,
        });
        if (result.file.path === remake.path || (await app.vault.read(remake)) !== before)
          throw new Error('Edition collision');
        return { original: result.file.path, remake: remake.path, preserved: true };
      }),
    );
  }
  await check('journal writes real YAML totals and preserves earlier entries', async () => {
    const backup = await evaluate(async () => {
      const p = app.plugins.plugins['game-shelf'];
      const item = p.notes.list().find((x) => x.slug === 'the-legend-of-zelda-ocarina-of-time--1');
      const f = p.notes.file(item.path);
      const content = await app.vault.read(f);
      const v = await p.openShelf('library');
      v.selectLibrary(f.path, true);
      return { path: f.path, content, minutes: item.minutes };
    });
    try {
      await evaluate(() => {
        const t = document.querySelector('.gs-journal-text');
        t.value = 'E2E journal entry: earlier writing must survive.';
        t.dispatchEvent(new Event('input', { bubbles: true }));
        const m = document.querySelector('.gs-journal input');
        m.value = '10';
        m.dispatchEvent(new Event('input', { bubbles: true }));
        document
          .querySelector('.gs-journal')
          .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      await until(
        `app.plugins.plugins['game-shelf'].notes.list().find(x=>x.path===${JSON.stringify(backup.path)})?.minutes===${backup.minutes + 10}`,
      );
      const result = await evaluate(async (path) => {
        const p = app.plugins.plugins['game-shelf'];
        const file = p.notes.file(path);
        const body = await app.vault.read(file);
        return { body, fm: app.metadataCache.getFileCache(file).frontmatter };
      }, backup.path);
      assert(result.body.includes('E2E journal entry'));
      assert(result.body.includes('冒険の始まり'));
      assert.equal(result.fm.playtime_minutes, backup.minutes + 10);
      return { nativeMetadataTotal: result.fm.playtime_minutes, priorTextPreserved: true };
    } finally {
      await evaluate(
        async (path, content) => {
          const p = app.plugins.plugins['game-shelf'];
          await app.vault.process(p.notes.file(path), () => content);
        },
        backup.path,
        backup.content,
      );
    }
  });
  await check('refresh protects personal and edited source fields', async () =>
    evaluate(async () => {
      const p = app.plugins.plugins['game-shelf'];
      const item = p.notes.list().find((x) => x.slug === 'elden-ring');
      if (!item) throw new Error('Seed Elden Ring first');
      const file = p.notes.file(item.path),
        backup = await app.vault.read(file),
        game = await p.source.get(item.slug);
      try {
        await app.fileManager.processFrontMatter(file, (fm) => {
          fm.publishers = ['My curated publisher'];
          fm.status = 'replaying';
          fm.rating = 4.5;
          fm.custom_keep = 'Keep this';
        });
        await new Promise((r) => setTimeout(r, 200));
        const before = (await app.vault.read(file)).split('\n---\n').slice(1).join('\n---\n');
        const changes = p.notes.previewChanges(file, game, p.settings.groups);
        if (!changes.some((x) => x.key === 'publishers' && x.conflict))
          throw new Error('Edited publisher not flagged');
        const selected = new Set(changes.filter((x) => !x.conflict).map((x) => x.key));
        if (selected.size) await p.notes.applyChanges(file, game, changes, selected);
        await new Promise((r) => setTimeout(r, 200));
        const fm = app.metadataCache.getFileCache(file).frontmatter;
        const after = (await app.vault.read(file)).split('\n---\n').slice(1).join('\n---\n');
        if (
          fm.status !== 'replaying' ||
          fm.rating !== 4.5 ||
          fm.custom_keep !== 'Keep this' ||
          fm.publishers[0] !== 'My curated publisher' ||
          before !== after
        )
          throw new Error('Refresh changed personal data');
        return { conflictDetected: true, personalPropertiesPreserved: true, bodyPreserved: true };
      } finally {
        await app.vault.process(file, () => backup);
      }
    }),
  );
  await check('stale refresh preview refuses concurrent edits', async () =>
    evaluate(async () => {
      const p = app.plugins.plugins['game-shelf'];
      const item = p.notes.list().find((x) => x.slug === 'elden-ring');
      const file = p.notes.file(item.path);
      const backup = await app.vault.read(file);
      const game = await p.source.get(item.slug);
      try {
        await app.fileManager.processFrontMatter(file, (fm) => {
          fm.release_date = '2000-01-01';
        });
        await new Promise((r) => setTimeout(r, 200));
        const changes = p.notes.previewChanges(file, game, p.settings.groups);
        await app.fileManager.processFrontMatter(file, (fm) => {
          fm.release_date = '2001-01-01';
        });
        let rejected = false;
        try {
          await p.notes.applyChanges(file, game, changes, new Set(['release_date']));
        } catch (error) {
          rejected = String(error).includes('changed after');
        }
        if (!rejected) throw new Error('Stale preview was accepted');
        return { concurrentEditRejected: true };
      } finally {
        await app.vault.process(file, () => backup);
      }
    }),
  );
  await check('YAML comments survive personal edits and journal updates', async () =>
    evaluate(async () => {
      const p = app.plugins.plugins['game-shelf'];
      const item = p.notes.list().find((x) => x.slug === 'elden-ring');
      const file = p.notes.file(item.path);
      const backup = await app.vault.read(file);
      try {
        await app.vault.process(file, (content) =>
          content
            .replace(/\nrating:/, '\n# Keep this rating comment\nrating:')
            .replace(/(playtime_minutes: [0-9]+)/, '$1 # Keep this inline comment'),
        );
        await p.notes.setPersonal(file, 'rating', 3.5);
        await p.notes.session(file, 'YAML comment preservation check', 0);
        const content = await app.vault.read(file);
        if (
          !content.includes('# Keep this rating comment') ||
          !content.includes('# Keep this inline comment') ||
          !content.includes('YAML comment preservation check')
        )
          throw new Error('YAML comments were lost');
        return { leadingComment: true, inlineComment: true, journalWritten: true };
      } finally {
        await app.vault.process(file, () => backup);
      }
    }),
  );
  await check('property-name changes preserve existing notes and profiles', async () =>
    evaluate(async () => {
      const p = app.plugins.plugins['game-shelf'];
      const saved = structuredClone(p.settings);
      const before = p.notes.list();
      const item = before.find((x) => x.slug === 'elden-ring');
      const file = p.notes.file(item.path);
      const backup = await app.vault.read(file);
      let created;
      try {
        await p.updateSettings({
          ...saved,
          propertyNames: { game_id: 'catalog_id', rating: 'my_score', status: 'play_status' },
        });
        const after = p.notes.list();
        if (after.length !== before.length || !p.notes.find(item.id))
          throw new Error('Mapping stranded an existing note');
        await p.notes.setPersonal(file, 'rating', 3.5);
        await new Promise((r) => setTimeout(r, 150));
        const old = app.metadataCache.getFileCache(file).frontmatter;
        if (old.rating !== 3.5 || old.my_score !== undefined)
          throw new Error('Existing profile was changed');
        created = await p.notes.manual({
          title: 'E2E property profile',
          status: 'playing',
          rating: 4,
          ownership: 'owned',
          groups: [],
          saveCover: false,
        });
        await new Promise((r) => setTimeout(r, 150));
        const fm = app.metadataCache.getFileCache(created.file).frontmatter;
        if (typeof fm.catalog_id !== 'string' || fm.my_score !== 4 || fm.play_status !== 'playing')
          throw new Error('New profile not applied');
        return {
          existingNotesRetained: after.length,
          newProfileApplied: true,
          oldProfilePreserved: true,
        };
      } finally {
        if (created) await app.fileManager.trashFile(created.file);
        await app.vault.process(file, () => backup);
        await p.updateSettings(saved);
      }
    }),
  );
  await check('renaming a freshly created note preserves identity lookup', async () =>
    evaluate(async () => {
      const p = app.plugins.plugins['game-shelf'];
      const result = await p.notes.manual({
        title: 'E2E rename lookup',
        status: 'backlog',
        rating: null,
        ownership: 'owned',
        groups: [],
        saveCover: false,
      });
      try {
        await new Promise((r) => setTimeout(r, 150));
        const id = app.metadataCache.getFileCache(result.file).frontmatter.game_id;
        await app.fileManager.renameFile(result.file, 'Games/E2E renamed note.md');
        if (p.notes.find(id)?.path !== 'Games/E2E renamed note.md')
          throw new Error('Identity lookup lost after rename');
        return { identityPreserved: true };
      } finally {
        await app.fileManager.trashFile(result.file);
      }
    }),
  );
  await check('offline local covers decode in the native renderer', async () => {
    await evaluate(async () => {
      const p = app.plugins.plugins['game-shelf'];
      await p.updateSettings({ ...p.settings, online: false });
      const v = await p.openShelf('library');
      v.setTab('library');
    });
    await until(
      `[...document.querySelectorAll('.gs-game-card .gs-cover img')].some(i=>i.complete&&i.naturalWidth>0)`,
    );
    const images = await c.evaluate(
      `[...document.querySelectorAll('.gs-game-card .gs-cover img')].map(i=>({local:i.src.startsWith('app://'),loaded:i.complete&&i.naturalWidth>0}))`,
    );
    assert(images.length >= 6);
    assert(images.every((i) => i.local && i.loaded));
    return { loadedLocalImages: images.length };
  });
  await check('searchable native settings definitions are available', async () =>
    evaluate(() => {
      const tab = app.setting.pluginTabs.find((tab) => tab.id === 'game-shelf');
      const definitions = tab?.getSettingDefinitions();
      if (!definitions || definitions.length < 10) throw new Error('Settings definitions missing');
      return { definitions: definitions.length };
    }),
  );
  await check('native Settings toggle disables outbound lookups', async () => {
    await evaluate(async () => {
      const p = app.plugins.plugins['game-shelf'];
      await p.updateSettings({ ...p.settings, online: true });
      app.setting.open();
      app.setting.openTabById('game-shelf');
    });
    const settingsWindow = await connect({ urlPrefix: 'about:blank' });
    try {
      const label = await c.evaluate(`app.plugins.plugins['game-shelf'].t('network')`);
      await settingsWindow.evaluate(
        `(()=>{const row=[...document.querySelectorAll('.setting-item')].find(x=>x.querySelector('.setting-item-name')?.textContent===${JSON.stringify(label)});if(!row)throw new Error('Native settings row missing');row.querySelector('.checkbox-container').click();return true})()`,
      );
      await until(`app.plugins.plugins['game-shelf'].settings.online===false`);
      await c.call('Network.enable');
      const requests = [];
      const off = c.on('Network.requestWillBeSent', (event) => {
        if (event.request.url.includes('gamesneverdie.com')) requests.push(event.request.url);
      });
      try {
        const error = await evaluate(async () => {
          try {
            await app.plugins.plugins['game-shelf'].source.get('e2e-online-must-remain-disabled');
            return null;
          } catch (error) {
            return String(error);
          }
        });
        assert(error && /off|オフ/.test(error));
        assert.equal(requests.length, 0);
      } finally {
        off();
        await c.call('Network.disable');
      }
      return { nativeControl: true, outboundRequests: 0 };
    } finally {
      settingsWindow.close();
      await evaluate(() => app.setting.close());
    }
  });
} finally {
  if (savedSettings)
    await evaluate(async (settings) => {
      const p = app.plugins.plugins['game-shelf'];
      await p.updateSettings(settings);
      await p.openShelf('library');
    }, savedSettings).catch(() => undefined);
  await mkdir(new URL('../docs/', import.meta.url), { recursive: true });
  await writeFile(
    new URL('../docs/verification.json', import.meta.url),
    JSON.stringify(report, null, 2) + '\n',
  );
  c.close();
}
