import { defineConfig } from 'oxfmt';

export default defineConfig({
  sortImports: {
    groups: [
      'type-import',
      'type-internal',
      ['type-parent', 'type-sibling', 'type-index'],
      ['value-builtin', 'value-external'],
      'value-internal',
      ['value-parent', 'value-sibling', 'value-index'],
      'unknown',
    ],
    newlinesBetween: false,
  },
  sortPackageJson: false,
  singleQuote: true,
  ignorePatterns: ['CHANGELOG.md'],
});
