/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@reckoning/shared/tts': resolve(__dirname, '../shared/src/tts/index.ts'),
      '@reckoning/shared/game': resolve(__dirname, '../shared/src/game/index.ts'),
      '@reckoning/shared': resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    typecheck: {
      enabled: false, // Disable vitest's typecheck to avoid duplicate checking
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/__tests__/**'],
    },
  },
});
