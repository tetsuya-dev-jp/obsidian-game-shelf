import { defineConfig, globalIgnores } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';
export default defineConfig([
  globalIgnores([
    'node_modules/**',
    'main.js',
    'esbuild.config.mjs',
    'scripts/**',
    'e2e/**',
    'eslint.config.mjs',
    'vitest.config.ts',
  ]),
  ...obsidianmd.configs.recommended,
  { files: ['**/*.ts'], languageOptions: { parserOptions: { projectService: true } } },
]);
