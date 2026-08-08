/**
 * Runtime config for the generated `@pops/food` Hey API client.
 *
 * Forces the base URL to the shell's `/food-api` proxy path, which vite
 * (dev) and the production reverse proxy both map onto the deployed food
 * pillar on port 3005. This is unconditional — a `baseUrl` passed in here is
 * discarded, so the default client can never be pointed somewhere else by
 * accident.
 *
 * To run against another host (e2e, storybook), build a separate client with
 * `createClient({ baseUrl })` and pass it per call as `options.client`; this
 * hook is not the override seam.
 */
import type { CreateClientConfig } from './food-api/client.gen.js';

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: '/food-api',
});
