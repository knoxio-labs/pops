import { defineConfig, devices } from '@playwright/test';

import base from './playwright.config';

/**
 * The opt-in acceptance specs (`e2e/*.acceptance.spec.ts`): the default
 * config's all-modules shell, and nothing else. Unlike every other spec, these
 * drive a real pillar process the spec boots itself, so they run only when
 * asked — `mise run inventory:acceptance -- --web` — and never in the E2E
 * workflow. The finance-only server is left out: it needs every pillar's
 * manifest built, and no acceptance spec runs against it.
 */
const allModulesServer = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer;

export default defineConfig({
  ...base,
  testMatch: ['**/*.acceptance.spec.ts'],
  retries: 0,
  workers: 1,
  projects: [{ name: 'chromium-acceptance', use: { ...devices['Desktop Chrome'] } }],
  ...(allModulesServer === undefined ? {} : { webServer: allModulesServer }),
});
