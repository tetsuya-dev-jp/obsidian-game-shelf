import { defineConfig, globalIgnores } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';
export default defineConfig([
  globalIgnores([
    'node_modules/**',
    '.audit/**',
    'main.js',
    'esbuild.config.mjs',
    'scripts/**',
    'e2e/**',
    'eslint.config.mjs',
    'vitest.config.ts',
  ]),
  ...obsidianmd.configs.recommended,
  { files: ['**/*.ts'], languageOptions: { parserOptions: { projectService: true } } },
  {
    files: ['src/source.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.property.name=/^(createElement|createElementNS|createDocumentFragment)$/]',
          message: 'Keep provider parsing in its inert document without creating DOM wrappers.',
        },
      ],
    },
  },
]);
