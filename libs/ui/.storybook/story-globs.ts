/**
 * The Storybook `stories` globs, pulled out of `main.ts` so a test can walk
 * the exact same specifiers Storybook indexes from — see
 * `src/__tests__/storybook-config.test.ts`. Every entry is resolved relative
 * to this directory (`.storybook/`), matching how Storybook itself resolves
 * a `stories` entry against the config directory.
 */
export const storyGlobs: string[] = [
  '../src/**/*.mdx',
  '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
  '../../!(ui)/src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
  '../../../pillars/*/*/src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
];
