import type { CreateClientConfig } from './trips-api/client.gen';

/** Use the shell's authenticated same-origin API proxy. */
export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: '/trips-api',
});
