import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    globals: true,
    // Default to node; component tests opt into happy-dom with a
    // `// @vitest-environment happy-dom` docblock (avoids WXT's plugin
    // intercepting Vitest's Vite HMR-client import in a DOM environment).
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['lib/**/*.test.ts', 'lib/**/*.test.tsx', 'entrypoints/**/*.test.ts', 'tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts', 'tests/component/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['lib/**/*.ts'],
      exclude: ['lib/**/*.test.ts', '**/index.ts'],
      thresholds: {
        // Domain layer target per TESTING.md.
        'lib/analysis/**': { statements: 85, branches: 80, functions: 85, lines: 85 },
      },
    },
  },
});
