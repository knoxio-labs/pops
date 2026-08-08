/**
 * Runtime config for the generated cerebrum Hey API client.
 *
 * Forces the base URL to the shell's `/cerebrum-api` proxy path, which vite
 * (dev) and the production reverse proxy both map onto the deployed cerebrum
 * pillar on port 3007. This is unconditional — a `baseUrl` passed in here is
 * discarded, so the default client can never be pointed somewhere else by
 * accident.
 *
 * To run against another host (e2e, storybook), build a separate client with
 * `createClient({ baseUrl })` and pass it per call as `options.client`; this
 * hook is not the override seam.
 */
import type { CreateClientConfig } from './cerebrum-api/client.gen.js';

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: '/cerebrum-api',
});
