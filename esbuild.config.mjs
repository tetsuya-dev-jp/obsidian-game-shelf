import esbuild from 'esbuild';
const options = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian'],
  format: 'cjs',
  target: 'es2020',
  platform: 'browser',
  outfile: 'main.js',
  minify: true,
  sourcemap: false,
  treeShaking: true,
  banner: { js: '/* Game Shelf | MIT | https://github.com/tetsuya-dev-jp/obsidian-game-shelf */' },
};
if (process.argv.includes('--watch')) {
  const context = await esbuild.context(options);
  await context.watch();
} else {
  await esbuild.build(options);
}
