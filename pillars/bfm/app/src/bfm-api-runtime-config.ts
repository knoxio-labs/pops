/**
 * Runtime config for the generated bfm Hey API client.
 *
 * The default base URL points at the shell's `/bfm-api` proxy path, which
 * vite (dev) and the production reverse proxy both map onto the deployed bfm
 * pillar on port 3014. Callers can override `baseUrl` via the React provider
 * when running against another host (e2e, storybook).
 */
import type { CreateClientConfig } from './bfm-api/client.gen.js';

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: '/bfm-api',
});
