import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['node_modules/**', '.output/**', '.wxt/**', 'coverage/**', 'test-results/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // Auto-generated/global APIs from WXT.
    languageOptions: {
      globals: {
        defineBackground: 'readonly',
        defineContentScript: 'readonly',
        browser: 'readonly',
      },
    },
  },
);
