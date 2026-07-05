/**
 * Server-SDK wiring for the MCP tool layer.
 *
 * Every tool file imports `getPillar()` from here rather than calling
 * `pillar()` from `@pops/pillar-sdk/server` directly so the
 * `configureServerSdk(...)` call lands once, at module load. The MCP
 * binary historically authenticated with `POPS_API_KEY`; the pillar SDK
 * looks for `POPS_INTERNAL_API_KEY`. We read whichever is set and route
 * the value into the SDK explicitly.
 *
 * Tool files type their handle with their pillar's `AppRouter` so the
 * proxy is fully typed end-to-end:
 *
 *     import type { AppRouter as InventoryAppRouter } from '@pops/inventory-api/router';
 *     const inventory = getPillar<InventoryAppRouter>('inventory');
 *     await inventory.inventory.locations.list();
 *
 * Base-URL resolution goes through the registry-driven discovery in
 * `@pops/pillar-sdk/server` — every pillar self-registers its real
 * Docker-network `baseUrl` on boot, so that's the source of truth.
 * `POPS_<PILLAR>_API_URL` env vars remain a supported per-pillar escape
 * hatch (e.g. pointing a single pillar at `localhost` in dev), but unlike
 * before, they only apply when explicitly set — there is no hardcoded
 * default that can drift out of sync with the compose fleet and silently
 * outrank the registry.
 */
import { configureServerSdk, pillar } from '@pops/pillar-sdk/server';

import type { PillarHandle } from '@pops/pillar-sdk/server';

const PILLAR_API_URL_ENV_VARS: Readonly<Record<string, string>> = {
  inventory: 'POPS_INVENTORY_API_URL',
  finance: 'POPS_FINANCE_API_URL',
  registry: 'POPS_REGISTRY_API_URL',
  media: 'POPS_MEDIA_API_URL',
  cerebrum: 'POPS_CEREBRUM_API_URL',
  contacts: 'POPS_CONTACTS_API_URL',
};

type ApiKeySource = 'POPS_INTERNAL_API_KEY' | 'POPS_API_KEY';

interface ResolvedApiKey {
  key: string;
  source: ApiKeySource;
}

function resolveInternalBaseUrlOverrides(): Record<string, string> | undefined {
  const overrides: Record<string, string> = {};
  for (const [pillarId, envVar] of Object.entries(PILLAR_API_URL_ENV_VARS)) {
    const value = process.env[envVar];
    if (value !== undefined && value.length > 0) overrides[pillarId] = value;
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

function resolveApiKey(): ResolvedApiKey | undefined {
  const explicit = process.env['POPS_INTERNAL_API_KEY'];
  if (explicit && explicit.length > 0) return { key: explicit, source: 'POPS_INTERNAL_API_KEY' };
  const legacy = process.env['POPS_API_KEY'];
  if (legacy && legacy.length > 0) return { key: legacy, source: 'POPS_API_KEY' };
  return undefined;
}

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  const resolved = resolveApiKey();
  if (resolved === undefined) {
    throw new Error(
      '[pops-mcp] no service-account key in environment: set POPS_INTERNAL_API_KEY (or legacy POPS_API_KEY) before calling pillar tools.'
    );
  }
  // Silent auth-source misconfig (CF087) is hard to debug in production — log
  // which env var actually won so an unexpected legacy fallback is visible.
  console.warn(`[pops-mcp] resolved service-account key from ${resolved.source}`);
  const registryUrl = process.env['POPS_REGISTRY_URL'];
  const internalBaseUrls = resolveInternalBaseUrlOverrides();
  configureServerSdk({
    apiKey: resolved.key,
    ...(internalBaseUrls !== undefined ? { internalBaseUrls } : {}),
    ...(registryUrl !== undefined ? { registry: { registryUrl } } : {}),
  });
  configured = true;
}

/**
 * Get a typed pillar handle for the given pillar ID. Idempotent — the
 * underlying SDK memoises per-pillar handles, so repeated calls are
 * cheap and share their discovery cache.
 */
export function getPillar<TRouter>(pillarId: string): PillarHandle<TRouter> {
  ensureConfigured();
  return pillar<TRouter>(pillarId);
}

/**
 * Test seam — drops the boot guard so a test can install a fresh config
 * and re-bootstrap.
 */
export function __resetPillarClientForTests(): void {
  configured = false;
}
