/**
 * The pure half of the dev server's `/design-api` proxy: given the resolved
 * `.env` values, what target and headers should vite proxy to. Split out of
 * `vite.config.ts` so it can be unit-tested without booting a vite server.
 */
import { DEFAULT_PORT } from './api/boot-env';

/** Where a locally-run `design-api` (`pnpm --filter @pops/design dev:api`) listens. */
export const LOCAL_DESIGN_API_URL = `http://127.0.0.1:${DEFAULT_PORT}`;

export interface DesignApiProxyEnv {
  POPS_DESIGN_FEEDBACK_URL?: string;
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
}

export interface DesignApiProxyConfig {
  target: string;
  headers?: Record<string, string>;
}

/**
 * Default to the local API so the comment overlay works with no setup at
 * all; an explicitly-set `POPS_DESIGN_FEEDBACK_URL` (a deployed API) always
 * wins over that default. The Cloudflare Access service-token headers are
 * attached whenever both halves are configured, which in practice only
 * happens when pointed at a deployed API — the local API trusts any caller.
 */
export function resolveDesignApiProxyConfig(env: DesignApiProxyEnv): DesignApiProxyConfig {
  const explicit = env.POPS_DESIGN_FEEDBACK_URL;
  const target = explicit !== undefined && explicit.trim() !== '' ? explicit : LOCAL_DESIGN_API_URL;
  const clientId = env.CF_ACCESS_CLIENT_ID;
  const clientSecret = env.CF_ACCESS_CLIENT_SECRET;
  if (clientId === undefined || clientSecret === undefined) return { target };
  return {
    target,
    headers: {
      'CF-Access-Client-Id': clientId,
      'CF-Access-Client-Secret': clientSecret,
    },
  };
}
