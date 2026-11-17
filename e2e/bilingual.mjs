// Real Obsidian in the isolated harness; network responses and credentials are synthetic.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { connect } from './cdp.mjs';

const state = JSON.parse(await readFile(new URL('./.runtime/launcher.json', import.meta.url), 'utf8'));
assert.equal(state.vaultPath, new URL('./.runtime/vault', import.meta.url).pathname);
const client = await connect();
const evaluate = (fn, ...args) => client.evaluate(`(${fn.toString()})(${args.map((arg) => JSON.stringify(arg)).join(',')})`, { timeoutMs: 30000 });
const report = { date: new Date().toISOString(), syntheticNetwork: true, nativeMobile: false, checks: [] };
const root = 'E2E bilingual 1.1.0';
let saved;
async function check(name, fn) {
  const details = await fn();
  report.checks.push({ name, status: 'pass', details });
  console.log(`PASS ${name}`);
}
async function until(expression) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (await client.evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${expression}`);
}
try {
  assert.equal(await client.evaluate('app.vault.adapter.basePath'), state.vaultPath);
  await client.evaluate(`(async()=>{document.querySelector('.mod-trust-folder .modal-button-container button:last-child')?.click();for(const modal of document.querySelectorAll('.modal-container:not(.mod-confirmation)'))modal.querySelector('.modal-header-button, .modal-close-button')?.click();if(!app.plugins.isEnabled())await app.plugins.setEnable(true)})()`);
  // Startup loads plugins asynchronously; wait before unloading the first instance.
  await until(`app.plugins.plugins['game-shelf']?._events.length>0`);
  await client.evaluate(`(async()=>{await app.plugins.unloadPlugin('game-shelf');await app.plugins.loadManifests();await app.plugins.loadPlugin('game-shelf')})()`);
  await client.evaluate('app.setting.close()');
  await client.call('Page.bringToFront');
  report.app = await client.evaluate(`({title:document.title,plugin:app.plugins.plugins['game-shelf'].manifest.version})`);
  saved = await client.evaluate(`(()=>{const p=app.plugins.plugins['game-shelf'];return {settings:structuredClone(p.settings),snapshots:structuredClone(p.snapshots),schemas:structuredClone(p.schemas)}})()`);
  await evaluate((html, searchHtml) => {
    const p = app.plugins.plugins['game-shelf'];
    window.gameShelfFixture = { request: p.request, calls: [], authFails: false, html, searchHtml };
    p.app.secretStorage.setSecret('game-shelf-e2e-key', 'fixture-value');
    p.request = async (url, options) => {
      const fixture = window.gameShelfFixture;
      fixture.calls.push(new URL(url).hostname);
      if (url === 'https://id.twitch.tv/oauth2/token') {
        if (fixture.authFails) return { status: 401, text: '{}' };
        if (!options.body.includes(['client', 'secret'].join('_') + '=' + ['fixture', 'value'].join('-'))) throw new Error('Credentials were not sent in the form body');
        return { status: 200, text: JSON.stringify({ access_token: 'fixture-token', expires_in: 3600 }) };
      }
      if (url === 'https://api.igdb.com/v4/games/count') return { status: 200, text: '{"count":1}' };
      if (url === 'https://api.igdb.com/v4/games') {
        if (options.body.includes('release_region.name')) throw new Error('Undocumented IGDB field');
        return { status: 200, text: JSON.stringify([{
          id: 424242, slug: 'bilingual-fixture', name: 'English Fixture Game',
          summary: 'An English overview retained from the selected source.', rating: 87,
          genres: [{ name: 'Adventure' }], platforms: [{ name: 'PC' }],
          cover: { url: '//images.igdb.com/igdb/image/upload/t_cover_big/bilingual-fixture.png' },
          release_dates: [{ y: 2026, m: 11, d: 17, release_region: { region: 'worldwide' }, platform: { name: 'PC' } }],
          videos: [{ video_id: 'fixture-video' }],
          screenshots: [{ url: '//images.igdb.com/igdb/image/upload/t_screenshot_huge/bilingual-fixture.png' }],
        }]) };
      }
      if (url.startsWith('https://gamesneverdie.com/ja/games/')) return { status: 200, text: fixture.html };
      if (url.startsWith('https://gamesneverdie.com/ja/search')) return { status: 200, text: fixture.searchHtml };
      if (['images.igdb.com', 'media.gamesneverdie.com'].includes(new URL(url).hostname)) {
        const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z6QAAAABJRU5ErkJggg=='), (char) => char.charCodeAt(0));
        return { status: 200, arrayBuffer: bytes.buffer, text: '' };
      }
      throw new Error('Unexpected fixture destination');
    };
  }, await readFile(new URL('../tests/fixtures/game.html', import.meta.url), 'utf8'), await readFile(new URL('../tests/fixtures/search.html', import.meta.url), 'utf8'));

  // Prevent synthetic artwork URLs from reaching external image services in the native renderer.
  await client.call('Fetch.enable', { patterns: [{ urlPattern: 'https://images.igdb.com/*' }, { urlPattern: 'https://media.gamesneverdie.com/*' }] });
  client.on('Fetch.requestPaused', (event) => {
    void client.call('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'image/png' }],
      body: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z6QAAAABJRU5ErkJggg==',
    }).catch(() => {});
  });

  await check('native EN and JA credential guides expose SecretStorage controls and official links', async () => {
    const results = [];
    for (const language of ['en', 'ja']) results.push(await evaluate(async (language) => {
      const p = app.plugins.plugins['game-shelf'];
      await p.updateSettings({ ...p.settings, language });
      p.openIgdbSetup();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const modal = [...document.querySelectorAll('.modal-container .modal')].at(-1);
      if (!modal || !modal.textContent.includes('Confidential') || !modal.textContent.includes('http://localhost')) throw new Error('Guide steps missing');
      const links = [...modal.querySelectorAll('a')].map((link) => link.href);
      if (!links.includes('https://dev.twitch.tv/console/apps')) throw new Error('Developer console link missing');
      if (modal.querySelectorAll('.setting-item').length < 4) throw new Error('Credential controls missing');
      modal.querySelector('.modal-header-button, .modal-close-button').click();
      return { language, controls: 4, officialLinks: links.length };
    }, language));
    return results;
  });

  await check('English search requires setup and offline connection tests send nothing', async () => evaluate(async () => {
    const p = app.plugins.plugins['game-shelf'];
    await p.updateSettings({ ...p.settings, language: 'en', noteLanguage: 'en', provider: 'auto', online: false, igdbClientId: '', igdbClientSecret: '' });
    const before = window.gameShelfFixture.calls.length;
    let rejected = false;
    try { await p.testIgdbConnection(); } catch { rejected = true; }
    if (!rejected || window.gameShelfFixture.calls.length !== before) throw new Error('Offline request escaped');
    await p.updateSettings({ ...p.settings, online: true });
    await p.openShelf('discover');
    if (!document.querySelector('.gs-root').textContent.includes(p.t('missingIgdbSetup'))) throw new Error('Setup gate missing');
    return { requestsWhileOffline: 0, setupRequired: true };
  }));

  await check('Japanese UI creates an English IGDB note through search and preview', async () => {
    await evaluate(async (folder) => {
      const p = app.plugins.plugins['game-shelf'];
      const storageKey = ['game', 'shelf', 'e2e', 'key'].join('-');
      await p.updateSettings({ ...p.settings, folder, coverFolder: `${folder}/Attachments`, language: 'ja', noteLanguage: 'en', provider: 'auto', online: true,
        igdbClientId: 'fixture-client', igdbClientSecret: 'game-shelf-e2e-key', groups: ['basics', 'description', 'media'], saveCover: true });
      await p.testIgdbConnection();
      await p.openShelf('discover');
      const input = document.querySelector('.gs-search-form input');
      input.value = 'English Fixture'; input.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('.gs-search-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }, root);
    await until(`document.querySelectorAll('.gs-result').length===1`);
    await client.evaluate(`document.querySelector('.gs-result').click()`);
    await until(`!!document.querySelector('.gs-note-preview pre')`);
    const preview = await client.evaluate(`document.querySelector('.gs-note-preview pre').textContent`);
    assert(preview.includes('## My notes') && preview.includes('## Play log') && preview.includes('Trailer 1'));
    assert(preview.includes('igdb:424242') && preview.includes('note_language: "en"'));
    await client.evaluate(`document.querySelector('.gs-create-action button').click()`);
    await until(`app.plugins.plugins['game-shelf'].notes.list().some(x=>x.id==='igdb:424242')`);
    return evaluate(async () => {
      const p = app.plugins.plugins['game-shelf']; const file = p.notes.find('igdb:424242');
      const body = await app.vault.read(file);
      if (!body.includes('## My notes') || !body.includes('An English overview') || !body.includes('igdb-424242.png')) throw new Error('Saved note differs from preview');
      window.gameShelfFixture.englishPath = file.path;
      return { noteLanguage: 'en', uiLanguage: 'ja', localCover: true, sourceId: 'igdb:424242' };
    });
  });

  await check('Japanese notes, English notes and manual notes preserve their own log language', async () => evaluate(async () => {
    const p = app.plugins.plugins['game-shelf'];
    const english = p.notes.find('igdb:424242');
    await p.updateSettings({ ...p.settings, language: 'en', noteLanguage: 'ja', provider: 'auto' });
    if (p.selectedProvider() !== 'gamesneverdie') throw new Error('Note language did not select GND');
    const game = await p.source.get('test-game');
    const japanese = await p.notes.create(game, { title: '日本語のテスト作品', status: 'backlog', rating: null, ownership: 'owned', groups: ['basics', 'media'], saveCover: true });
    await p.notes.session(japanese.file, '日本語のプレイ記録', 17);
    await p.notes.session(english, 'English session', 12);
    const jaBody = await app.vault.read(japanese.file), enBody = await app.vault.read(english);
    if (!jaBody.includes('17 分') || !jaBody.includes('## プレイ記録') || !jaBody.includes('予告編')) throw new Error('Japanese writing labels missing');
    if (!enBody.includes('12 min') || !enBody.includes('## Play log')) throw new Error('Existing English note changed language');
    const manual = await p.notes.manual({ title: '手動ノート', status: 'playing', rating: 4, ownership: 'owned', groups: [], saveCover: false });
    const manualBody = await app.vault.read(manual.file);
    if (!manualBody.includes('note_language: "ja"')) throw new Error('Manual note language not saved');
    const again = await p.notes.create(game, { title: '重複', status: 'backlog', rating: null, ownership: 'owned', groups: [], saveCover: false });
    if (!again.existing || again.file.path !== japanese.file.path) throw new Error('Duplicate source identity not retained');
    return { englishLog: '12 min', japaneseLog: '17 分', manualLanguage: 'ja', duplicateOpened: true };
  }));

  await check('source refresh preserves edited titles, body and source identity after defaults change', async () => evaluate(async () => {
    const p = app.plugins.plugins['game-shelf']; const file = p.notes.find('igdb:424242');
    await app.vault.process(file, (body) => body.replace('title: "English Fixture Game"', 'title: "My own title"') + '\nPersonal prose to retain.\n');
    await new Promise((resolve) => setTimeout(resolve, 350));
    const before = await app.vault.read(file);
    const game = await p.sourceFor('igdb').get('424242', false, true);
    const changes = p.notes.previewChanges(file, game, ['basics', 'description', 'media']);
    if (!changes.some((change) => change.key === 'title' && change.conflict)) throw new Error('Edited title was not protected');
    const selected = new Set(changes.filter((change) => !change.conflict).map((change) => change.key));
    if (selected.size) await p.notes.applyChanges(file, game, changes, selected);
    const after = await app.vault.read(file);
    if (!after.includes('My own title') || !after.includes('Personal prose to retain.') || !after.includes('igdb:424242')) throw new Error('Personal data or identity changed');
    if (before.slice(before.indexOf('## Game information')) !== after.slice(after.indexOf('## Game information'))) throw new Error('Refresh changed body');
    let wrongSourceRejected = false;
    try { p.notes.previewChanges(file, await p.source.get('test-game'), ['basics']); } catch { wrongSourceRejected = true; }
    if (!wrongSourceRejected) throw new Error('Cross-source refresh was allowed');
    return { conflictProtected: true, bodyPreserved: true, wrongSourceRejected };
  }));

  await check('legacy notes require an explicit language before saving another session', async () => evaluate(async () => {
    const p = app.plugins.plugins['game-shelf'];
    await p.updateSettings({ ...p.settings, noteLanguage: 'en' });
    const created = await p.notes.manual({ title: 'Legacy note', status: 'backlog', rating: null, ownership: 'owned', groups: [], saveCover: false });
    await app.vault.process(created.file, (body) => body.replace(/^note_language:.*\n/m, ''));
    await new Promise((resolve) => setTimeout(resolve, 350));
    await p.updateSettings({ ...p.settings, language: 'ja', noteLanguage: 'ja' });
    const before = await app.vault.read(created.file);
    let rejected = false;
    try { await p.notes.session(created.file, 'Must not be saved', 9); } catch { rejected = true; }
    if (!rejected || await app.vault.read(created.file) !== before) throw new Error('Legacy session changed an unresolved note');
    const view = await p.openShelf('library');
    view.selectLibrary(created.file.path);
    const select = document.querySelector(`select[aria-label="${p.t('noteWritingLanguage')}"]`);
    if (!select || select.value !== '') throw new Error('Explicit language control missing');
    select.value = 'en'; select.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 500));
    await p.notes.session(created.file, 'English after selection', 9);
    const after = await app.vault.read(created.file);
    if (!after.includes('9 min') || !after.includes('## My notes')) throw new Error('Chosen language or original prose lost');
    return { unresolvedSaveRejected: true, unchangedOnRejection: true, nativeLanguageSelection: true, savedUnit: 'min' };
  }));

  await check('language switching retains four unique working localized commands', async () => evaluate(async () => {
    const p = app.plugins.plugins['game-shelf'];
    const names = { 'open-library': 'openLibraryCommand', 'find-game': 'findGameCommand', 'add-manually': 'manualCommand', 'log-session': 'logSessionCommand' };
    for (const language of ['en', 'ja', 'en']) {
      await p.updateSettings({ ...p.settings, language });
      const commands = Object.values(app.commands.commands).filter((command) => command.id.startsWith('game-shelf:'));
      if (commands.length !== 4) throw new Error('Command count changed');
      for (const command of commands) if (!command.name.endsWith(p.t(names[command.id.split(':')[1]]))) throw new Error('Command language is stale');
      app.commands.executeCommandById('game-shelf:find-game');
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (!document.querySelector('.gs-search-form')) throw new Error('Localized command failed to open discovery');
    }
    return { languages: ['en', 'ja', 'en'], commands: 4, execution: true };
  }));

  await check('credentials and tokens are absent from plugin persistence and generated notes', async () => evaluate(async (folder) => {
    const p = app.plugins.plugins['game-shelf'];
    await p.persist();
    const persisted = JSON.stringify(await p.loadData());
    if (persisted.includes('fixture-value') || persisted.includes('fixture-token')) throw new Error('Credential/token persisted');
    for (const file of app.vault.getMarkdownFiles().filter((file) => file.path.startsWith(`${folder}/`))) {
      const text = await app.vault.read(file);
      if (text.includes('fixture-value') || text.includes('fixture-token')) throw new Error('Credential/token in note');
    }
    return { persistedSecrets: false, persistedTokens: false, secretReferenceSaved: persisted.includes('game-shelf-e2e-key') };
  }, root));

  await check('custom property-name profiles survive plugin reload for both providers', async () => evaluate(async () => {
    const p = app.plugins.plugins['game-shelf'];
    await p.updateSettings({ ...p.settings, noteLanguage: 'en', propertyNames: { game_id: 'shelf_identity', note_language: 'writing_language', title: 'game_title' } });
    const source = await p.sourceFor('igdb').get('424242');
    const alternate = { ...source, id: '424243', slug: 'another-fixture' };
    const created = await p.notes.create(alternate, { title: 'Mapped properties', status: 'completed', rating: 5, ownership: 'owned', groups: ['basics'], saveCover: false });
    await p.updateSettings({ ...p.settings, propertyNames: {}, language: 'ja', noteLanguage: 'ja' });
    const path = created.file.path;
    await app.plugins.unloadPlugin('game-shelf'); await app.plugins.loadPlugin('game-shelf');
    const reloaded = app.plugins.plugins['game-shelf'];
    await new Promise((resolve) => setTimeout(resolve, 350));
    const item = reloaded.notes.list().find((item) => item.path === path);
    if (!item || item.id !== 'igdb:424243' || item.noteLanguage !== 'en' || item.title !== 'Mapped properties') throw new Error('Mapped note lost on reload');
    await reloaded.notes.session(reloaded.notes.file(path), 'Still in English', 3);
    const body = await app.vault.read(reloaded.notes.file(path));
    if (!body.includes('3 min')) throw new Error('Reload lost per-note language');
    return { restoredId: item.id, language: item.noteLanguage, propertyProfile: true };
  }));
} catch (error) {
  report.checks.push({ name: 'execution', status: 'fail', details: error.message });
  throw error;
} finally {
  if (saved) await evaluate(async (saved, folder) => {
    const p = app.plugins.plugins['game-shelf'];
    for (const file of app.vault.getFiles().filter((file) => file.path.startsWith(`${folder}/`))) await app.fileManager.trashFile(file);
    p.snapshots = saved.snapshots; p.schemas = saved.schemas;
    p.notes.context.snapshots = p.snapshots; p.notes.context.schemas = p.schemas;
    if (window.gameShelfFixture && p.request !== window.gameShelfFixture.request) p.request = window.gameShelfFixture.request;
    app.secretStorage.setSecret('game-shelf-e2e-key', '');
    await p.updateSettings(saved.settings);
    delete window.gameShelfFixture;
  }, saved, root).catch((error) => { report.cleanupError = error.message; });
  await client.call('Fetch.disable').catch(() => {});
  await writeFile(new URL('../docs/verification-1.1.0.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  client.close();
}
