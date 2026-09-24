import { defineConfig } from 'vite';

import { remoteBuildConfig } from '@pops/pillar-sdk/remote-build';

/**
 * Remote-bundle build for `@pops/app-lists`: `lists.js`, the ES module the shell's
 * runtime loader imports at the pillar's `assetsBaseUrl`, and `lists.css`, the
 * stylesheet it installs from `stylesheetUrl`. The recipe is shared by every
 * pillar and documented on `remoteBuildConfig`.
 *
 * The package itself stays source-only — `@pops/app-lists` resolves to
 * `src/index.ts` for every in-repo consumer. This build exists alongside that,
 * not instead of it.
 */
export default defineConfig(remoteBuildConfig({ pillar: 'lists', appRoot: import.meta.dirname }));
