/**
 * Structural `ModuleManifest` for the ai pillar — the source the registry
 * pillar's discovery walk consumes via the package's `./manifest` export.
 *
 * `surfaces: ['app']` — the AI usage dashboard (`@pops/app-ai`) is the pillar's
 * UI surface, mounted by the shell's runtime loader from the URL this pillar
 * advertises rather than compiled into the shell (POPS-3220).
 */
import { aiConfigManifest } from './settings/ai-manifest.js';

import type { ModuleManifest } from '@pops/types';

export { AI_NAV } from './nav.js';
export { AI_PAGES } from './pages.js';
export type { AiPageSlot } from './pages.js';

export const aiManifest: ModuleManifest = {
  id: 'ai',
  name: 'AI Ops',
  version: '0.1.0',
  surfaces: ['app'],
  description: 'AI usage, providers, model config, prompts, and rules browser.',
  settings: [aiConfigManifest],
};
