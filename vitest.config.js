import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      include: ['src/Task.ts', 'src/TaskCollection.ts'],
      provider: 'v8',
      reporter: ['text'],
    },
  },
});
