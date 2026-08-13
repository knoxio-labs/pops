/**
 * Runtime config for app-finance's generated purchases Hey API client.
 *
 * The default base URL points at the shell's `/purchases-api` proxy path,
 * which vite (dev) and the production reverse proxy both map onto the
 * deployed purchases pillar — the same pinning every other generated client
 * in this app uses.
 */
import type { CreateClientConfig } from './purchases-api/client.gen.js';

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: '/purchases-api',
});
