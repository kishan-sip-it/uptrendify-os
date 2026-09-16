import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts', 'components/**/*.test.ts'],
    clearMocks: true,
    reporters: ['dot'],
  },
});