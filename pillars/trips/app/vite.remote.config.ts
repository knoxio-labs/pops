import { defineConfig } from 'vite';

import { remoteBuildConfig } from '@pops/pillar-sdk/remote-build';

export default defineConfig(remoteBuildConfig({ pillar: 'trips', appRoot: import.meta.dirname }));
