import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const NGINX_CONF_PATH = resolve(SCRIPT_DIR, 'nginx.conf');
const VITE_CONFIG_PATH = resolve(SCRIPT_DIR, 'vite.config.ts');

function isDefined(value: string | undefined): value is string {
  return value !== undefined;
}

function extractNginxApiPrefixes(nginxConf: string): string[] {
  const matches = [...nginxConf.matchAll(/location\s+\/([\w-]+-api)\//g)];
  return [...new Set(matches.map((m) => m[1]).filter(isDefined))];
}

function extractViteProxyPrefixes(viteConfig: string): string[] {
  const matches = [...viteConfig.matchAll(/'\/([\w-]+-api)':\s*\{/g)];
  return [...new Set(matches.map((m) => m[1]).filter(isDefined))];
}

describe('vite dev proxy / nginx prod proxy parity', () => {
  it('every <pillar>-api prefix routed by nginx.conf also has a vite.config.ts dev proxy rule', async () => {
    const [nginxConf, viteConfig] = await Promise.all([
      readFile(NGINX_CONF_PATH, 'utf8'),
      readFile(VITE_CONFIG_PATH, 'utf8'),
    ]);

    const nginxPrefixes = extractNginxApiPrefixes(nginxConf);
    const vitePrefixes = new Set(extractViteProxyPrefixes(viteConfig));

    expect(nginxPrefixes.length).toBeGreaterThan(0);

    const missing = nginxPrefixes.filter((prefix) => !vitePrefixes.has(prefix));
    expect(missing).toEqual([]);
  });

  it('includes the contacts-api and ai-api prefixes (regression guard for CF031)', async () => {
    const viteConfig = await readFile(VITE_CONFIG_PATH, 'utf8');
    const vitePrefixes = new Set(extractViteProxyPrefixes(viteConfig));

    expect(vitePrefixes.has('contacts-api')).toBe(true);
    expect(vitePrefixes.has('ai-api')).toBe(true);
  });
});
