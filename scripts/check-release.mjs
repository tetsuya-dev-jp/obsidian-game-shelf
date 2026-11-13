import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const manifest = await json('manifest.json'),
  pkg = await json('package.json'),
  versions = await json('versions.json');
assert.equal(manifest.id, 'game-shelf');
assert.equal(manifest.name, 'Game Shelf');
assert(/^[0-9]+\.[0-9]+\.[0-9]+$/.test(manifest.version));
assert.equal(pkg.version, manifest.version);
assert.equal(versions[manifest.version], manifest.minAppVersion);
assert.equal(manifest.isDesktopOnly, false);
assert(manifest.description.length <= 250 && manifest.description.endsWith('.'));
for (const file of [
  'main.js',
  'manifest.json',
  'styles.css',
  'README.md',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'docs/submission.md',
  'docs/media/library-dark.png',
  'docs/media/discover.png',
  'docs/media/journal.png',
  'docs/media/demo.gif',
  'docs/media/demo.mp4',
])
  assert((await stat(file)).size > 0, `Missing release artifact: ${file}`);
const code = await readFile('main.js', 'utf8');
assert(
  !/require\(["'](?:node:|fs["']|child_process["']|electron["'])/.test(code),
  'Node/Electron import in browser bundle',
);
assert(
  !code.includes('eval(') && !code.includes('new Function('),
  'Dynamic code execution in bundle',
);
assert((await stat('main.js')).size < 300 * 1024, 'Review the bundle size before release');
console.log(`Release ${manifest.version} validated; bundle ${(await stat('main.js')).size} bytes.`);
