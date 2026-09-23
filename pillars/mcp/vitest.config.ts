import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `**/*.live-seam.test.ts` spawns real registry + inventory OS processes
    // and is an order of magnitude slower than this mocked-`pillar-client`
    // suite; run it via `pnpm test:live-seam`.
    exclude: [...configDefaults.exclude, '**/dist/**', '**/*.live-seam.test.ts'],
  },
});
