import type { CreateClientConfig } from './contacts-api/client.gen.js';

/** Bind browser requests to the shell's authenticated contacts proxy. */
export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: '/contacts-api',
});
