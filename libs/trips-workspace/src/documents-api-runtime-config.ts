import type { CreateClientConfig } from './documents-api/client.gen.js';

/** Use the shell's authenticated same-origin Documents proxy. */
export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: '/documents-api',
});
