import type { CreateClientConfig } from './trips-api/client.gen.js';

/** Default Trips requests use the shell's authenticated API proxy. */
export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: '/trips-api',
});
