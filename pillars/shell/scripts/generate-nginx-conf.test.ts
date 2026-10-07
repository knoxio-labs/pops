import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PILLARS } from '@pops/pillar-sdk';

import {
  PILLAR_RENDER_ORDER,
  PILLAR_UPSTREAMS,
  assertRenderOrderCoversAllPillars,
  orderUpstreams,
  parseCliArgsForGenerator,
  renderNginxConf,
  renderNginxConfDynamic,
  renderNginxConfFromUpstreams,
  resolveUpstreamForEntry,
  type PillarUpstream,
} from './generate-nginx-conf.js';
import {
  GUEST_FORBIDDEN_LOCATION,
  GUEST_GUARD,
  GUEST_PATH_PREFIXES,
  guestGateFromEnv,
  isGuestPath,
  parseOperatorEmails,
  rejectedOperatorEmailsWarning,
  renderGuestMap,
} from './nginx-guest-gate.js';
import { EGO_STREAM_LOCATION, renderPillarRestBlockFromUpstream } from './nginx-pillar-blocks.js';
import { resolveRegistryUrl } from './registry-url-env.js';

import type { DiscoveredPillar, DiscoveryTransport } from '@pops/pillar-sdk/client';
import type { ManifestPayload } from '@pops/pillar-sdk/manifest-schema';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const COMMITTED_CONF_PATH = resolve(SCRIPT_DIR, '..', 'nginx.conf');
const PROXY_SNIPPET_PATH = resolve(SCRIPT_DIR, '..', 'nginx', 'conf.d', '_pillar-proxy.conf');

function buildManifest(pillarId: string): ManifestPayload {
  return {
    pillar: pillarId,
    version: '0.0.1-test',
    contract: {
      package: '@pops/core-contract',
      version: '0.0.1-test',
      tag: 'contract-core@v0.0.1-test',
    },
    routes: { queries: [], mutations: [], subscriptions: [] },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/health' },
  };
}

function discoveredPillar(pillarId: string, baseUrl: string): DiscoveredPillar {
  return {
    pillarId,
    baseUrl,
    status: 'healthy',
    manifest: buildManifest(pillarId),
    lastSeenAt: '2026-06-13T00:00:00.000Z',
    registered: true,
  };
}

class FakeDiscoveryTransport implements DiscoveryTransport {
  constructor(private readonly snapshot: readonly DiscoveredPillar[]) {}

  fetchSnapshot(): Promise<readonly DiscoveredPillar[]> {
    return Promise.resolve(this.snapshot);
  }
}

function makeTransport(
  pillars: readonly { pillarId: string; baseUrl: string }[]
): DiscoveryTransport {
  return new FakeDiscoveryTransport(pillars.map((p) => discoveredPillar(p.pillarId, p.baseUrl)));
}

describe('generate-nginx-conf', () => {
  describe('drift detection', () => {
    it('committed pillars/shell/nginx.conf matches the generator output', async () => {
      const expected = renderNginxConf();
      const actual = await readFile(COMMITTED_CONF_PATH, 'utf8');
      expect(actual).toBe(expected);
    });
  });

  describe('pillar coverage', () => {
    it('PILLAR_UPSTREAMS has an entry for every PILLARS id', () => {
      for (const id of PILLARS) {
        expect(PILLAR_UPSTREAMS[id]).toBeDefined();
      }
    });

    it('PILLAR_RENDER_ORDER covers every PILLARS id with no extras', () => {
      expect(() => assertRenderOrderCoversAllPillars()).not.toThrow();
      expect(new Set(PILLAR_RENDER_ORDER)).toEqual(new Set(PILLARS));
      expect(PILLAR_RENDER_ORDER).toHaveLength(PILLARS.length);
    });

    it('every pillar gets a host:port pair with a non-empty host and a positive port', () => {
      for (const id of PILLARS) {
        const upstream = PILLAR_UPSTREAMS[id];
        expect(upstream.host.length).toBeGreaterThan(0);
        expect(Number.isInteger(upstream.port)).toBe(true);
        expect(upstream.port).toBeGreaterThan(0);
      }
    });

    it('per-pillar ports are unique', () => {
      const ports = PILLARS.map((id) => PILLAR_UPSTREAMS[id].port);
      expect(new Set(ports).size).toBe(ports.length);
    });
  });

  describe('rendered output structure', () => {
    const rendered = renderNginxConf();

    it('renders no per-pillar /trpc-<id>/ dispatcher blocks (pillars serve REST, not /trpc)', () => {
      for (const id of PILLARS) {
        expect(rendered).not.toContain(`location /trpc-${id}/ {`);
      }
      expect(rendered).not.toMatch(/location \/trpc-[a-z]/);
    });

    it('contains no `trpc` substring at all', () => {
      expect(rendered).not.toContain('trpc');
    });

    it('emits one /<id>-api/ REST block per pillar', () => {
      for (const id of PILLARS) {
        expect(rendered).toContain(`location /${id}-api/ {`);
      }
    });

    it('each REST block strips the /<id>-api prefix down to /', () => {
      for (const id of PILLARS) {
        expect(rendered).toContain(`rewrite ^/${id}-api/(.*)$ /$1 break;`);
      }
    });

    it('each REST block proxies to its PILLAR_UPSTREAMS host:port', () => {
      for (const id of PILLARS) {
        const { host, port } = PILLAR_UPSTREAMS[id];
        expect(rendered).toContain(`set $${id}_api_upstream http://${host}:${port};`);
        expect(rendered).toContain(`proxy_pass $${id}_api_upstream;`);
      }
    });

    it('each REST block includes the shared _pillar-proxy.conf partial (mirrors media)', () => {
      // Known pillar ids carry no hyphens, so their nginx var name == the id.
      const pillarVarAlternation = PILLAR_RENDER_ORDER.map((id) => id.replace(/-/g, '_')).join('|');
      const perPillarRestIncludes = rendered.match(
        new RegExp(
          `proxy_pass \\$(?:${pillarVarAlternation})_api_upstream;\\n\\s*include /etc/nginx/snippets/_pillar-proxy\\.conf;`,
          'g'
        )
      );
      expect(perPillarRestIncludes).not.toBeNull();
      expect(perPillarRestIncludes ?? []).toHaveLength(PILLARS.length);
    });

    it('renders REST blocks in PILLAR_RENDER_ORDER', () => {
      const positions = PILLAR_RENDER_ORDER.map((id) => rendered.indexOf(`location /${id}-api/ {`));
      for (let i = 1; i < positions.length; i += 1) {
        expect(positions[i]!).toBeGreaterThan(positions[i - 1]!);
        expect(positions[i]!).toBeGreaterThan(-1);
      }
    });

    it('renders every REST block after the REST-surfaces intro comment', () => {
      const introIdx = rendered.indexOf('Per-pillar REST surfaces');
      expect(introIdx).toBeGreaterThan(-1);
      for (const id of PILLARS) {
        const restIdx = rendered.indexOf(`location /${id}-api/ {`);
        expect(restIdx).toBeGreaterThan(introIdx);
      }
    });

    it('routes /registry-api specifically to the registry pillar on :3001', () => {
      const { host, port } = PILLAR_UPSTREAMS.registry;
      expect(host).toBe('registry-api');
      expect(port).toBe(3001);
      expect(rendered).toContain('location /registry-api/ {');
      expect(rendered).toContain('set $registry_api_upstream http://registry-api:3001;');
    });

    it('emits no /core-api alias — the registry pillar is reached at /registry-api', () => {
      // The shell's registry client posts to `/registry-api/`; there is no
      // `/core-api/` alias block.
      expect(rendered).not.toContain('location /core-api/ {');
      expect(rendered).not.toContain('core-api');
    });

    it('emits `set $<pillar>_api_upstream` BEFORE `rewrite ... break` in every pillar block', () => {
      // `rewrite ... break` halts the ngx_http_rewrite_module phase, so a `set`
      // placed after it never runs — the upstream variable stays uninitialised
      // and `proxy_pass $var` 500s with "invalid URL prefix". The `set` must
      // precede the `rewrite` in each `/<pillar>-api/` block.
      for (const id of Object.keys(PILLAR_UPSTREAMS)) {
        const block = rendered.match(
          new RegExp(`location /${id}-api/ \\{([\\s\\S]*?)\\n    \\}`)
        )?.[1];
        expect(block, `missing /${id}-api/ block`).toBeDefined();
        const setIdx = block!.indexOf(`set $`);
        const rewriteIdx = block!.indexOf('rewrite ');
        expect(setIdx).toBeGreaterThanOrEqual(0);
        expect(rewriteIdx).toBeGreaterThanOrEqual(0);
        expect(setIdx, `set must precede rewrite in /${id}-api/`).toBeLessThan(rewriteIdx);
      }
    });

    it('emits `set` before `rewrite ... break` in the orchestrator block too', () => {
      const block = rendered.match(/location \/orchestrator-api\/ \{([\s\S]*?)\n    \}/)?.[1];
      expect(block, 'missing /orchestrator-api/ block').toBeDefined();
      const setIdx = block!.indexOf('set $');
      const rewriteIdx = block!.indexOf('rewrite ');
      expect(setIdx).toBeGreaterThanOrEqual(0);
      expect(rewriteIdx).toBeGreaterThanOrEqual(0);
      expect(setIdx, 'set must precede rewrite in /orchestrator-api/').toBeLessThan(rewriteIdx);
    });

    it('routes the registry /registry/subscribe SSE stream to the registry pillar with buffering off', () => {
      expect(rendered).toContain('location ~ ^/registry/subscribe/?$ {');
      expect(rendered).toContain('set $registry_subscribe_upstream http://registry-api:3001;');
      expect(rendered).toMatch(
        /location ~ \^\/registry\/subscribe\/\?\$ \{[\s\S]*?proxy_buffering off;/
      );
    });

    it('renders one exact Cerebrum SSE location with long timeouts and no shared snippet', () => {
      const locations = rendered.match(/location = \/cerebrum-api\/ego\/chat\/stream \{/g);
      expect(locations).toHaveLength(1);

      const block = rendered.match(
        /location = \/cerebrum-api\/ego\/chat\/stream \{([\s\S]*?)\n    \}/
      )?.[1];
      expect(block).toBeDefined();
      expect(block).toContain('set $cerebrum_ego_stream_upstream http://cerebrum-api:3007;');
      expect(block).toContain('proxy_buffering off;');
      expect(block).toContain('proxy_read_timeout 300s;');
      expect(block).toContain('proxy_send_timeout 300s;');
      expect(block).not.toContain('_pillar-proxy.conf');
      expect(block!.indexOf('set $cerebrum_ego_stream_upstream')).toBeLessThan(
        block!.indexOf('rewrite ^/cerebrum-api/')
      );
      expect(rendered.match(/proxy_buffering off;/g)).toHaveLength(2);
    });

    it('leaves every non-Cerebrum REST block byte-identical to the generic block', () => {
      for (const pillarId of PILLARS.filter((id) => id !== 'cerebrum')) {
        const { host, port } = PILLAR_UPSTREAMS[pillarId];
        const guard = isGuestPath(`/${pillarId}-api/`) ? [] : [GUEST_GUARD];
        expect(
          renderPillarRestBlockFromUpstream({ pillarId, host, port }),
          `${pillarId} REST block`
        ).toBe(
          [
            `    location /${pillarId}-api/ {`,
            `        set $${pillarId}_api_upstream http://${host}:${port};`,
            ...guard,
            `        rewrite ^/${pillarId}-api/(.*)$ /$1 break;`,
            `        proxy_pass $${pillarId}_api_upstream;`,
            `        include /etc/nginx/snippets/_pillar-proxy.conf;`,
            `    }`,
          ].join('\n')
        );
      }
    });

    it('keeps /pillars on registry-api and moves /pillars/health onto registry-api too', () => {
      expect(rendered).toMatch(
        /location ~ \^\/pillars\/\?\$ \{[\s\S]*?set \$pillars_upstream http:\/\/registry-api:3001;/
      );
      expect(rendered).toMatch(
        /location ~ \^\/pillars\/health\/\?\$ \{[\s\S]*?set \$pillars_health_upstream http:\/\/registry-api:3001;/
      );
    });

    it('renders no /trpc → pops-api monolith catch-all', () => {
      expect(rendered).not.toContain('location /trpc {');
      expect(rendered).not.toMatch(/proxy_pass http:\/\/pops-api:3000/);
    });

    it('routes the relocated raw routes (Up Bank webhook, inventory byte routes) to their pillars', () => {
      expect(rendered).toMatch(
        /location \/webhooks\/up \{[\s\S]*?set \$up_webhook_upstream http:\/\/finance-api:3004;/
      );
      expect(rendered).toMatch(
        /location ~ \^\/\(api\/inventory\|inventory\/documents\)\/ \{[\s\S]*?set \$inventory_upstream http:\/\/inventory-api:3002;/
      );
    });

    it('keeps the /pillars and /pillars/health registry proxies', () => {
      expect(rendered).toContain('location ~ ^/pillars/?$ {');
      expect(rendered).toContain('location ~ ^/pillars/health/?$ {');
    });

    it('keeps /media/images/, /health, /docs/, /design/, and the SPA fallback', () => {
      expect(rendered).toContain('location /media/images/ {');
      expect(rendered).toContain('location /health {');
      expect(rendered).toContain('location /docs/ {');
      expect(rendered).toContain('location /design/ {');
      expect(rendered).toMatch(/location \/ \{[\s\S]*?try_files \$uri \$uri\/ \/index\.html;/);
    });

    it('declares the docker DNS resolver so variable-form proxy_pass works', () => {
      expect(rendered).toContain('resolver 127.0.0.11');
    });

    it('emits the non-pillar /orchestrator-api/ block to pops-orchestrator:3009', () => {
      expect(rendered).toContain('location /orchestrator-api/ {');
      expect(rendered).toContain('rewrite ^/orchestrator-api/(.*)$ /$1 break;');
      expect(rendered).toContain('set $orchestrator_api_upstream http://pops-orchestrator:3009;');
      expect(rendered).toContain('proxy_pass $orchestrator_api_upstream;');
    });

    it('emits exactly one /orchestrator-api/ block (not per-pillar)', () => {
      const matches = rendered.match(/location \/orchestrator-api\/ \{/g);
      expect(matches).toHaveLength(1);
    });

    it('keeps the orchestrator out of PILLAR_UPSTREAMS (it is not a pillar)', () => {
      expect(PILLARS).not.toContain('orchestrator');
      expect(Object.keys(PILLAR_UPSTREAMS)).not.toContain('orchestrator');
    });

    it('renders the orchestrator block after the pillar REST blocks and before the relocated raw routes', () => {
      const lastRestIdx = Math.max(
        ...PILLAR_RENDER_ORDER.map((id) => rendered.indexOf(`location /${id}-api/ {`))
      );
      const orchestratorIdx = rendered.indexOf('location /orchestrator-api/ {');
      const webhookIdx = rendered.indexOf('location /webhooks/up {');
      expect(orchestratorIdx).toBeGreaterThan(lastRestIdx);
      expect(webhookIdx).toBeGreaterThan(orchestratorIdx);
    });

    it('renders pillar blocks in PILLAR_RENDER_ORDER', () => {
      const positions = PILLAR_RENDER_ORDER.map((id) => ({
        id,
        index: rendered.indexOf(`location /${id}-api/ {`),
      }));
      for (let i = 1; i < positions.length; i += 1) {
        expect(positions[i]!.index).toBeGreaterThan(positions[i - 1]!.index);
        expect(positions[i]!.index).toBeGreaterThan(-1);
      }
    });
  });

  describe('request correlation and gateway failures', () => {
    const rendered = renderNginxConf();

    it('preserves an incoming request id and mints one when the header is absent', () => {
      expect(rendered).toMatch(
        /map \$http_x_request_id \$pops_request_id \{\s*default \$http_x_request_id;\s*"" \$request_id;\s*\}/
      );
      expect(rendered).toContain('add_header X-Request-Id $pops_request_id always;');
    });

    it('redeclares the response request id wherever another add_header prevents inheritance', () => {
      const locationsWithHeaders = [...rendered.matchAll(/location [^{]+\{([\s\S]*?)\n    \}/g)]
        .map((match) => match[1] ?? '')
        .filter((block) => block.includes('add_header'));
      expect(locationsWithHeaders.length).toBeGreaterThan(0);
      for (const block of locationsWithHeaders) {
        expect(block).toContain('add_header X-Request-Id $pops_request_id always;');
      }
    });

    it('records the effective request id in the JSON access log', () => {
      expect(rendered).toContain('log_format pops_json escape=json');
      expect(rendered).toContain('"requestId":"$pops_request_id"');
      expect(rendered).toContain('access_log /var/log/nginx/access.log pops_json;');
    });

    it('forwards the effective request id from both server defaults and the shared proxy snippet', async () => {
      const proxySnippet = await readFile(PROXY_SNIPPET_PATH, 'utf8');
      expect(rendered).toContain('proxy_set_header X-Request-Id $pops_request_id;');
      expect(proxySnippet).toContain('proxy_set_header X-Request-Id $pops_request_id;');
    });

    it('replaces only nginx-generated 502, 503, and 504 failures', () => {
      expect(rendered.match(/error_page \d{3} = @gateway_\d{3};/g)).toEqual([
        'error_page 502 = @gateway_502;',
        'error_page 503 = @gateway_503;',
        'error_page 504 = @gateway_504;',
      ]);
      expect(rendered).toContain('proxy_intercept_errors off;');
      expect(rendered).not.toContain('proxy_intercept_errors on;');
    });

    it.each([502, 503, 504])(
      'returns a retryable ADR-054 gateway envelope for nginx %i failures',
      (status) => {
        const block = rendered.match(
          new RegExp(`location @gateway_${status} \\{([\\s\\S]*?)\\n    \\}`)
        )?.[1];
        expect(block, `missing @gateway_${status} location`).toBeDefined();
        expect(block).toContain('default_type application/json;');
        expect(block).toContain(`return ${status} '`);
        expect(block).toContain('"code":"gateway.upstream_unavailable"');
        expect(block).toContain('"requestId":"$pops_request_id"');
        expect(block).toContain('"retryable":true');
      }
    );
  });

  /**
   * nginx 1.31's bundled mime.types has no `.mjs` entry, so without a rule of
   * our own such an asset leaves nginx as the octet-stream default_type and a
   * browser refuses to run it as a module script or a worker. Verified against
   * the real image: `docker run nginx:1.31.3-alpine grep mjs /etc/nginx/mime.types`
   * matches nothing, and the served Content-Type was application/octet-stream
   * before this rule existed.
   */
  describe('.mjs assets', () => {
    const rendered = renderNginxConf();

    it('is served with a JavaScript MIME type', () => {
      expect(rendered).toMatch(/location ~ \\\.mjs\$ \{[^}]*default_type application\/javascript;/);
    });

    it('is matched by a regex location, which outranks the /assets/ prefix', () => {
      expect(rendered.indexOf('location /assets/ {')).toBeGreaterThan(-1);
      expect(rendered).toContain('location ~ \\.mjs$ {');
    });

    it('keeps the immutable caching the /assets/ prefix would otherwise have given it', () => {
      const block = rendered.slice(rendered.indexOf('location ~ \\.mjs$ {'));
      const body = block.slice(0, block.indexOf('}'));
      expect(body).toContain('expires 1y;');
      expect(body).toContain('add_header Cache-Control "public, immutable";');
    });
  });

  /**
   * index.html names the hashed assets of the build it shipped with, and
   * /assets/ is `immutable` — so an index.html a browser may reuse without
   * asking pins that session to the previous deploy's bundle. The behavioural
   * half of this guard is in `scripts/ci/smoke-image.mjs`, which reads the
   * header off the running image; these assertions only pin the config that
   * produces it.
   */
  describe('index.html freshness', () => {
    const rendered = renderNginxConf();
    const fallback = rendered.slice(rendered.lastIndexOf('    location / {'));

    it('forces revalidation on the location that serves index.html', () => {
      expect(fallback).toContain('add_header Cache-Control "no-cache, must-revalidate";');
    });

    it('keeps the SPA fallback, so deep links still reach index.html with that header', () => {
      expect(fallback).toContain('try_files $uri $uri/ /index.html;');
    });

    it('sets no `expires`, which would emit a competing max-age', () => {
      expect(fallback).not.toContain('expires');
    });

    it('leaves hashed assets immutable — the fix must not disable /assets/ caching', () => {
      const assets = rendered.slice(rendered.indexOf('    location /assets/ {'));
      const body = assets.slice(0, assets.indexOf('}'));
      expect(body).toContain('expires 1y;');
      expect(body).toContain('add_header Cache-Control "public, immutable";');
      expect(body).not.toContain('no-cache');
    });

    it('matches /assets/ and .mjs before the fallback, so they keep their own policy', () => {
      expect(rendered.indexOf('location /assets/ {')).toBeLessThan(
        rendered.lastIndexOf('    location / {')
      );
      expect(rendered.indexOf('location ~ \\.mjs$ {')).toBeLessThan(
        rendered.lastIndexOf('    location / {')
      );
    });
  });

  describe('guest gate', () => {
    const OPERATORS = 'owner@example.com';
    const GUEST_MAP_OPEN = 'map $http_cf_access_authenticated_user_email $pops_guest {';

    /**
     * Locations a guest may reach although they proxy to a backend and sit
     * outside every guest prefix: they hold no private data or must stay
     * public. Adding a proxying location means guarding it, putting it under a
     * guest prefix, or naming it here on purpose.
     */
    const PUBLIC_PROXY_LOCATIONS: readonly RegExp[] = [
      /^\/webhooks\/up$/,
      /^\/health$/,
      /^~ \^\/pillars\/\?\$$/,
      /^~ \^\/pillars\/health\/\?\$$/,
      /^~ \^\/registry\/subscribe\/\?\$$/,
      /^\/docs\/$/,
      /^\/design\/$/,
      /^\/[a-z0-9-]+-ui\/$/,
    ];

    interface RenderedLocation {
      readonly selector: string;
      readonly body: string;
    }

    function locationsOf(conf: string): readonly RenderedLocation[] {
      return [...conf.matchAll(/^ {4}location ([^\n]+) \{\n([\s\S]*?)\n {4}\}$/gm)].map((m) => ({
        selector: m[1] ?? '',
        body: m[2] ?? '',
      }));
    }

    function mapBlock(conf: string): string {
      const start = conf.indexOf(GUEST_MAP_OPEN);
      expect(start, 'guest map missing').toBeGreaterThanOrEqual(0);
      return conf.slice(start, conf.indexOf('\n}', start) + 2);
    }

    function unguardedProxyLocations(
      conf: string,
      guestPathPrefixes: readonly string[] = GUEST_PATH_PREFIXES
    ): readonly string[] {
      return locationsOf(conf)
        .filter(({ body }) => body.includes('proxy_pass'))
        .filter(({ body }) => !body.split('\n').includes(GUEST_GUARD))
        .filter(({ selector }) => !isGuestPath(selector.replace(/^= /, ''), guestPathPrefixes))
        .filter(({ selector }) => !PUBLIC_PROXY_LOCATIONS.some((allowed) => allowed.test(selector)))
        .map(({ selector }) => selector);
    }

    function guardedSelectors(conf: string): readonly string[] {
      return locationsOf(conf)
        .filter(({ body }) => body.split('\n').includes(GUEST_GUARD))
        .map(({ selector }) => selector);
    }

    function fullRegistry(): DiscoveryTransport {
      return makeTransport(
        PILLARS.map((id) => ({
          pillarId: id,
          baseUrl: `http://${PILLAR_UPSTREAMS[id].host}:${PILLAR_UPSTREAMS[id].port}`,
        }))
      );
    }

    describe('with POPS_OPERATOR_EMAILS unset', () => {
      it.each([
        ['absent', undefined],
        ['empty', ''],
        ['blank', '  '],
        ['only separators', ' , ,'],
      ])('classifies nobody as a guest when the list is %s', (_label, raw) => {
        expect(mapBlock(renderGuestMap(raw))).toBe(`${GUEST_MAP_OPEN}\n    default 0;\n}`);
      });

      it('is what the committed conf and the default static render carry', async () => {
        const inert = `${GUEST_MAP_OPEN}\n    default 0;\n}`;
        expect(mapBlock(renderNginxConf())).toBe(inert);
        expect(mapBlock(await readFile(COMMITTED_CONF_PATH, 'utf8'))).toBe(inert);
      });

      it('is what the dynamic render carries, with no value mapped to 1', async () => {
        const rendered = await renderNginxConfDynamic('http://registry-api:3001', fullRegistry());
        expect(mapBlock(rendered)).toBe(`${GUEST_MAP_OPEN}\n    default 0;\n}`);
        expect(rendered).not.toMatch(/^\s+\S+ 1;$/m);
      });

      it('reads no operator list from an environment without the variable', () => {
        expect(guestGateFromEnv({})).toEqual({});
        expect(renderNginxConf(PILLAR_RENDER_ORDER, guestGateFromEnv({}))).toBe(renderNginxConf());
      });
    });

    describe('with POPS_OPERATOR_EMAILS set', () => {
      it('treats an identified non-operator as a guest and a headerless request as the operator', () => {
        expect(mapBlock(renderGuestMap('owner@example.com,second@example.org'))).toBe(
          [
            GUEST_MAP_OPEN,
            '    default 1;',
            '    "" 0;',
            '    "owner@example.com" 0;',
            '    "second@example.org" 0;',
            '}',
          ].join('\n')
        );
      });

      it('trims, lower-cases and de-duplicates entries (a repeated map key stops nginx loading)', () => {
        const parsed = parseOperatorEmails(
          ' Owner@Example.com ,owner@example.com,, OWNER@EXAMPLE.COM'
        );
        expect(parsed).toEqual({ enforced: true, emails: ['owner@example.com'], rejected: [] });
      });

      it.each([
        'owner@example.com" 0; } server { listen 81; } map $a $b { "x',
        'owner@example.com;',
        'owner@example.com 0',
        '~.*',
        'default',
        'owner@localhost',
        "o'brien@example.com",
        'owner@example.com\n"guest@example.com" 0;',
      ])('drops the malformed entry %j instead of writing it into the conf', (entry) => {
        const parsed = parseOperatorEmails(`owner@example.com,${entry}`);
        expect(parsed.emails).toEqual(['owner@example.com']);
        expect(parsed.rejected).toHaveLength(1);
        expect(mapBlock(renderGuestMap(`owner@example.com,${entry}`))).toBe(
          [GUEST_MAP_OPEN, '    default 1;', '    "" 0;', '    "owner@example.com" 0;', '}'].join(
            '\n'
          )
        );
      });

      it('still enforces when every entry is malformed, so a typo cannot open the gate', () => {
        expect(parseOperatorEmails('not-an-email')).toEqual({
          enforced: true,
          emails: [],
          rejected: ['not-an-email'],
        });
        expect(mapBlock(renderGuestMap('not-an-email'))).toBe(
          [GUEST_MAP_OPEN, '    default 1;', '    "" 0;', '}'].join('\n')
        );
      });

      it('warns with a count, never the entries, when some are dropped', () => {
        expect(rejectedOperatorEmailsWarning({ operatorEmails: 'owner@example.com' })).toBe('');
        expect(rejectedOperatorEmailsWarning({})).toBe('');
        const one = rejectedOperatorEmailsWarning({ operatorEmails: 'owner@example.com,oops' });
        expect(one).toBe(
          'generate-nginx-conf: ignoring 1 POPS_OPERATOR_EMAILS entry that is not a plain email address\n'
        );
        expect(rejectedOperatorEmailsWarning({ operatorEmails: 'oops,again' })).toContain(
          'ignoring 2 POPS_OPERATOR_EMAILS entries that are'
        );
      });

      it('reads the list from the environment', () => {
        expect(guestGateFromEnv({ POPS_OPERATOR_EMAILS: OPERATORS })).toEqual({
          operatorEmails: OPERATORS,
        });
      });

      it('changes only the map: every location is rendered the same with or without a list', () => {
        const withList = renderNginxConf(PILLAR_RENDER_ORDER, { operatorEmails: OPERATORS });
        const without = renderNginxConf();
        expect(withList).not.toBe(without);
        expect(withList.replace(mapBlock(withList), '')).toBe(
          without.replace(mapBlock(without), '')
        );
      });
    });

    describe('guarded locations', () => {
      it('leaves no backend-proxying location unguarded in the static render', () => {
        expect(unguardedProxyLocations(renderNginxConf())).toEqual([]);
      });

      it('leaves none unguarded in the dynamic render, including an externally registered pillar', async () => {
        const rendered = await renderNginxConfDynamic(
          'http://registry-api:3001',
          makeTransport([{ pillarId: 'external-drop', baseUrl: 'http://external-drop:4100' }]),
          { operatorEmails: OPERATORS }
        );
        expect(unguardedProxyLocations(rendered)).toEqual([]);
        expect(guardedSelectors(rendered)).toContain('/external-drop-api/');
      });

      it('leaves none unguarded in the empty-registry render', () => {
        expect(unguardedProxyLocations(renderNginxConfFromUpstreams([]))).toEqual([]);
      });

      it('fails for a proxying location that carries no guard', () => {
        const unguarded = renderNginxConf().replace(
          `        set $contacts_api_upstream http://contacts-api:3010;\n${GUEST_GUARD}\n`,
          '        set $contacts_api_upstream http://contacts-api:3010;\n'
        );
        expect(unguardedProxyLocations(unguarded)).toEqual(['/contacts-api/']);
      });

      it('guards exactly the pillar APIs outside the guest prefixes and the fixed private routes', () => {
        const gatedPillars = PILLAR_RENDER_ORDER.filter((id) => !isGuestPath(`/${id}-api/`));
        expect([...guardedSelectors(renderNginxConf())].toSorted()).toEqual(
          [
            ...gatedPillars.map((id) => `/${id}-api/`),
            `= ${EGO_STREAM_LOCATION}`,
            '/orchestrator-api/',
            '~ ^/(api/inventory|inventory/documents)/',
            '/media/images/',
          ].toSorted()
        );
      });

      it('leaves the finance and registry APIs open to guests', () => {
        expect(GUEST_PATH_PREFIXES).toEqual(['/finance-api/', '/registry-api/']);
        const guarded = guardedSelectors(renderNginxConf());
        expect(guarded).not.toContain('/finance-api/');
        expect(guarded).not.toContain('/registry-api/');
      });

      it('emits the same guards in both render modes', async () => {
        const gate = { operatorEmails: OPERATORS };
        const dynamic = await renderNginxConfDynamic(
          'http://registry-api:3001',
          fullRegistry(),
          gate
        );
        const staticRender = renderNginxConf(PILLAR_RENDER_ORDER, gate);
        expect(guardedSelectors(dynamic)).toEqual(guardedSelectors(staticRender));
        expect(dynamic).toBe(staticRender);
      });

      it('places the guard after `set` and before the prefix-stripping rewrite and proxy_pass', () => {
        for (const { selector, body } of locationsOf(renderNginxConf())) {
          const lines = body.split('\n');
          const guardIdx = lines.indexOf(GUEST_GUARD);
          if (guardIdx === -1) continue;
          const setIdx = lines.findIndex((line) => line.trimStart().startsWith('set $'));
          const breakIdx = lines.findIndex((line) => / break;$/.test(line));
          const proxyIdx = lines.findIndex((line) => line.trimStart().startsWith('proxy_pass '));
          expect(setIdx, `${selector}: set`).toBeGreaterThanOrEqual(0);
          expect(guardIdx, `${selector}: guard after set`).toBeGreaterThan(setIdx);
          expect(guardIdx, `${selector}: guard before proxy_pass`).toBeLessThan(proxyIdx);
          if (breakIdx !== -1) {
            expect(guardIdx, `${selector}: guard before rewrite break`).toBeLessThan(breakIdx);
          }
        }
      });
    });

    describe('guest path prefixes', () => {
      const bfm: PillarUpstream = { pillarId: 'bfm', host: 'bfm-api', port: 3014 };

      it('renders a prefix narrower than a pillar as its own unguarded block ahead of the guarded pillar block', () => {
        const prefixes = [...GUEST_PATH_PREFIXES, '/bfm-api/guest/'];
        expect(renderPillarRestBlockFromUpstream(bfm, prefixes)).toBe(
          [
            '    location /bfm-api/guest/ {',
            '        set $bfm_api_upstream http://bfm-api:3014;',
            '        rewrite ^/bfm-api/(.*)$ /$1 break;',
            '        proxy_pass $bfm_api_upstream;',
            '        include /etc/nginx/snippets/_pillar-proxy.conf;',
            '    }',
            '',
            '    location /bfm-api/ {',
            '        set $bfm_api_upstream http://bfm-api:3014;',
            GUEST_GUARD,
            '        rewrite ^/bfm-api/(.*)$ /$1 break;',
            '        proxy_pass $bfm_api_upstream;',
            '        include /etc/nginx/snippets/_pillar-proxy.conf;',
            '    }',
          ].join('\n')
        );
      });

      it('carries a narrower prefix through the full render without leaving anything unguarded', () => {
        const prefixes = [...GUEST_PATH_PREFIXES, '/bfm-api/guest/'];
        const rendered = renderNginxConf(PILLAR_RENDER_ORDER, { guestPathPrefixes: prefixes });
        expect(rendered.indexOf('location /bfm-api/guest/ {')).toBeGreaterThanOrEqual(0);
        expect(rendered.indexOf('location /bfm-api/guest/ {')).toBeLessThan(
          rendered.indexOf('location /bfm-api/ {')
        );
        expect(guardedSelectors(rendered)).toContain('/bfm-api/');
        expect(guardedSelectors(rendered)).not.toContain('/bfm-api/guest/');
        expect(unguardedProxyLocations(rendered, prefixes)).toEqual([]);
        expect(rendered.match(/location \/bfm-api\/guest\/ \{/g)).toHaveLength(1);
      });

      it('renders no extra block for a prefix inside a pillar that is already wholly open', () => {
        const finance: PillarUpstream = { pillarId: 'finance', host: 'finance-api', port: 3004 };
        const rendered = renderPillarRestBlockFromUpstream(finance, [
          '/finance-api/',
          '/finance-api/accounts/',
        ]);
        expect(rendered.match(/location /g)).toHaveLength(1);
        expect(rendered).not.toContain(GUEST_GUARD);
      });

      it('does not open a pillar whose id merely starts with a guest pillar id', () => {
        const lookalike: PillarUpstream = { pillarId: 'finance-archive', host: 'fa', port: 4200 };
        expect(renderPillarRestBlockFromUpstream(lookalike)).toContain(GUEST_GUARD);
      });

      it('guards the Cerebrum stream unless a guest prefix covers it', () => {
        const cerebrum: PillarUpstream = { pillarId: 'cerebrum', host: 'cerebrum-api', port: 3007 };
        const stream = (prefixes: readonly string[]): string =>
          renderPillarRestBlockFromUpstream(cerebrum, prefixes).split('\n\n')[0] ?? '';
        expect(stream(GUEST_PATH_PREFIXES)).toContain(GUEST_GUARD);
        expect(stream(['/cerebrum-api/ego/'])).not.toContain(GUEST_GUARD);
      });

      it.each(['/bfm-api/guest', 'bfm-api/guest/', '/bfm/guest/', '/bfm-api/guest/ {', '/'])(
        'rejects the malformed prefix %j',
        (prefix) => {
          expect(() => renderPillarRestBlockFromUpstream(bfm, [prefix])).toThrow(
            /guest path prefix/
          );
        }
      );
    });

    describe('refusal', () => {
      const rendered = renderNginxConf();
      const forbidden = locationsOf(rendered).filter(
        ({ selector }) => selector === `= ${GUEST_FORBIDDEN_LOCATION}`
      );

      it('answers 403 with the ADR-054 envelope and a gateway code, as JSON', () => {
        expect(forbidden).toHaveLength(1);
        const body = forbidden[0]?.body ?? '';
        expect(body).toContain('default_type application/json;');
        const payload = body.match(/return 403 '(.*)';/)?.[1];
        expect(payload).toBeDefined();
        const envelope: unknown = JSON.parse(payload!.replace('$pops_request_id', 'req-1'));
        expect(envelope).toEqual({
          code: 'gateway.guest_forbidden',
          message: 'This account cannot access this resource.',
          requestId: 'req-1',
          retryable: false,
        });
      });

      it('is internal, so a client cannot request the refusal location directly', () => {
        expect(forbidden[0]?.body.split('\n')).toContain('        internal;');
      });

      it('is where every guard sends a guest', () => {
        expect(GUEST_GUARD).toBe(
          `        if ($pops_guest) { rewrite ^ ${GUEST_FORBIDDEN_LOCATION} last; }`
        );
      });

      it('is present in the empty-registry render too', () => {
        expect(renderNginxConfFromUpstreams([])).toContain(
          `location = ${GUEST_FORBIDDEN_LOCATION} {`
        );
      });
    });
  });

  describe('determinism', () => {
    it('renderNginxConf() is pure — two calls produce identical output', () => {
      expect(renderNginxConf()).toBe(renderNginxConf());
    });

    it('reordering PILLAR_RENDER_ORDER changes the byte output (proves order is load-bearing)', () => {
      const canonical = renderNginxConf();
      const reversed = renderNginxConf(PILLAR_RENDER_ORDER.toReversed());
      expect(reversed).not.toBe(canonical);
      for (const id of PILLARS) {
        expect(reversed).toContain(`location /${id}-api/ {`);
      }
    });
  });

  describe('assertRenderOrderCoversAllPillars (defensive)', () => {
    it('does not throw for the canonical order', () => {
      expect(() => assertRenderOrderCoversAllPillars()).not.toThrow();
    });
  });

  describe('resolveUpstreamForEntry', () => {
    it('returns the canonical PILLAR_UPSTREAMS host:port for known pillars regardless of baseUrl', () => {
      const entry: Pick<DiscoveredPillar, 'pillarId' | 'baseUrl'> = {
        pillarId: 'finance',
        baseUrl: 'http://localhost:9999',
      };
      const upstream = resolveUpstreamForEntry(entry);
      expect(upstream).toEqual({
        pillarId: 'finance',
        host: PILLAR_UPSTREAMS.finance.host,
        port: PILLAR_UPSTREAMS.finance.port,
      });
    });

    it('parses host:port from baseUrl for unknown pillars', () => {
      const upstream = resolveUpstreamForEntry({
        pillarId: 'plugin-fitness',
        baseUrl: 'http://fitness-api:4200',
      });
      expect(upstream).toEqual({ pillarId: 'plugin-fitness', host: 'fitness-api', port: 4200 });
    });

    it('defaults port 80 for plain http baseUrl without explicit port', () => {
      const upstream = resolveUpstreamForEntry({
        pillarId: 'plugin-x',
        baseUrl: 'http://x-api',
      });
      expect(upstream.port).toBe(80);
    });

    it('defaults port 443 for https baseUrl without explicit port', () => {
      const upstream = resolveUpstreamForEntry({
        pillarId: 'plugin-y',
        baseUrl: 'https://y-api',
      });
      expect(upstream.port).toBe(443);
    });

    it('throws for malformed baseUrl on unknown pillars', () => {
      expect(() =>
        resolveUpstreamForEntry({ pillarId: 'plugin-bad', baseUrl: 'not a url' })
      ).toThrow(/invalid baseUrl/);
    });
  });

  describe('orderUpstreams', () => {
    it('places known pillars first in PILLAR_RENDER_ORDER, then unknowns alphabetically', () => {
      const upstreams: PillarUpstream[] = [
        { pillarId: 'plugin-z', host: 'z', port: 1 },
        { pillarId: 'finance', host: 'finance-api', port: 3004 },
        { pillarId: 'plugin-a', host: 'a', port: 1 },
        { pillarId: 'registry', host: 'registry-api', port: 3001 },
      ];
      const ordered = orderUpstreams(upstreams).map((u) => u.pillarId);
      expect(ordered).toEqual(['registry', 'finance', 'plugin-a', 'plugin-z']);
    });
  });

  describe('renderNginxConfFromUpstreams', () => {
    it('renders zero pillar blocks for an empty registry but keeps head + tail', () => {
      const rendered = renderNginxConfFromUpstreams([]);
      expect(rendered).not.toMatch(/location \/trpc-[a-z]/);
      expect(rendered).toContain('resolver 127.0.0.11');
      expect(rendered).not.toContain('location /trpc {');
      expect(rendered).toContain('location ~ ^/pillars/?$ {');
      expect(rendered).toContain('location /docs/ {');
      expect(rendered).toContain('location /design/ {');
      expect(rendered).toMatch(/location \/ \{[\s\S]*?try_files \$uri \$uri\/ \/index\.html;/);
    });

    it('handles hyphenated pillar ids by sanitising the nginx variable name', () => {
      const rendered = renderNginxConfFromUpstreams([
        { pillarId: 'plugin-fitness', host: 'fitness-api', port: 4200 },
      ]);
      expect(rendered).toContain('location /plugin-fitness-api/ {');
      expect(rendered).toContain('set $plugin_fitness_api_upstream http://fitness-api:4200;');
      expect(rendered).toContain('proxy_pass $plugin_fitness_api_upstream;');
    });

    it('emits a /<id>-api/ REST block for each upstream', () => {
      const rendered = renderNginxConfFromUpstreams([
        { pillarId: 'plugin-fitness', host: 'fitness-api', port: 4200 },
      ]);
      expect(rendered).toContain('location /plugin-fitness-api/ {');
      expect(rendered).toContain('rewrite ^/plugin-fitness-api/(.*)$ /$1 break;');
      expect(rendered).toContain('set $plugin_fitness_api_upstream http://fitness-api:4200;');
      expect(rendered).toContain('proxy_pass $plugin_fitness_api_upstream;');
      expect(rendered).not.toContain('trpc');
    });

    it('adds the exact stream route only for a Cerebrum upstream', () => {
      const cerebrum = renderNginxConfFromUpstreams([
        { pillarId: 'cerebrum', host: 'cerebrum-test', port: 4307 },
      ]);
      expect(cerebrum).toContain(`location = ${EGO_STREAM_LOCATION} {`);
      expect(cerebrum).toContain('set $cerebrum_ego_stream_upstream http://cerebrum-test:4307;');

      const finance = renderNginxConfFromUpstreams([
        { pillarId: 'finance', host: 'finance-test', port: 4304 },
      ]);
      expect(finance).not.toContain(EGO_STREAM_LOCATION);
    });

    it('emits zero pillar REST blocks for an empty registry but keeps the orchestrator block', () => {
      const rendered = renderNginxConfFromUpstreams([]);
      // The per-pillar `/<id>-api/` blocks are absent for an empty registry.
      expect(rendered).not.toMatch(
        /location \/(?:registry|inventory|media|finance|food|lists|cerebrum|contacts)-api\/ \{/
      );
      expect(rendered).toContain('location /orchestrator-api/ {');
    });

    it('emits the orchestrator block alongside pillar blocks for a non-empty registry', () => {
      const rendered = renderNginxConfFromUpstreams([
        { pillarId: 'plugin-fitness', host: 'fitness-api', port: 4200 },
      ]);
      const matches = rendered.match(/location \/orchestrator-api\/ \{/g);
      expect(matches).toHaveLength(1);
      expect(rendered).toContain('set $orchestrator_api_upstream http://pops-orchestrator:3009;');
    });

    it('skips a registry entry for the orchestrator — the fixed block already serves it', () => {
      const rendered = renderNginxConfFromUpstreams([
        { pillarId: 'orchestrator', host: 'pops-orchestrator', port: 3009 },
        { pillarId: 'plugin-fitness', host: 'fitness-api', port: 4200 },
      ]);
      expect(rendered.match(/location \/orchestrator-api\/ \{/g)).toHaveLength(1);
      expect(rendered).toContain('location /plugin-fitness-api/ {');
      // The survivor is the fixed block — it carries the template's comment header.
      expect(rendered).toContain('# ── Federated-search orchestrator (ADR-029, epic 06) ──');
    });

    it('renders a bare orchestrator-only registry as if it were empty', () => {
      const rendered = renderNginxConfFromUpstreams([
        { pillarId: 'orchestrator', host: 'pops-orchestrator', port: 3009 },
      ]);
      expect(rendered).toBe(renderNginxConfFromUpstreams([]));
      expect(rendered.match(/location \/orchestrator-api\/ \{/g)).toHaveLength(1);
    });
  });

  describe('request body limit', () => {
    // nginx defaults client_max_body_size to 1m. The finance import posts the
    // whole batch in one body — a two-year statement is ~1.3MB — so the default
    // 413s a normal import before it reaches the pillar. The limit therefore has
    // to be present in EVERY render path, not just the committed static file:
    // production serves the dynamic render, and a cold boot with an unreachable
    // registry serves the empty-upstream fallback.
    const LIMIT = 'client_max_body_size 20m;';

    it('is present in the static render', () => {
      expect(renderNginxConf()).toContain(LIMIT);
    });

    it('is present in the committed nginx.conf', async () => {
      const committed = await readFile(COMMITTED_CONF_PATH, 'utf8');
      expect(committed).toContain(LIMIT);
    });

    it('is present in the dynamic render', async () => {
      const transport = makeTransport(
        PILLARS.map((id) => ({
          pillarId: id,
          baseUrl: `http://${PILLAR_UPSTREAMS[id].host}:${PILLAR_UPSTREAMS[id].port}`,
        }))
      );
      expect(await renderNginxConfDynamic('http://registry-api:3001', transport)).toContain(LIMIT);
    });

    it('is present in the empty-registry boot fallback', () => {
      expect(renderNginxConfFromUpstreams([])).toContain(LIMIT);
    });
  });

  describe('renderNginxConfDynamic', () => {
    it('emits a config that mirrors the static output when the registry advertises every known pillar', async () => {
      const transport = makeTransport(
        PILLARS.map((id) => ({
          pillarId: id,
          baseUrl: `http://${PILLAR_UPSTREAMS[id].host}:${PILLAR_UPSTREAMS[id].port}`,
        }))
      );
      const rendered = await renderNginxConfDynamic('http://registry-api:3001', transport);
      expect(rendered).toBe(renderNginxConf());
    });

    /**
     * POPS-2793: a curated pillar keeps its canonical block even when the
     * live registry snapshot has nothing at all — this is what lets a
     * pillar mid-restart (absent from exactly the snapshot an SSE event
     * regenerates against) stay routable (502ing, not vanishing into the
     * SPA catch-all) instead of losing its route until some later event
     * happens to re-include it.
     */
    it('still emits every curated pillar block for an empty registry', async () => {
      const rendered = await renderNginxConfDynamic('http://registry-api:3001', makeTransport([]));
      for (const id of PILLARS) {
        expect(rendered).toContain(`location /${id}-api/ {`);
        const { host, port } = PILLAR_UPSTREAMS[id];
        expect(rendered).toContain(`set $${id}_api_upstream http://${host}:${port};`);
      }
      expect(rendered).not.toContain('location /trpc {');
      expect(rendered).not.toContain('trpc');
    });

    /**
     * The direct regression case: `contacts` is a real, conforming, curated
     * pillar that is simply missing from this one snapshot — e.g. the exact
     * restart-race shape seen live on 2026-09-08, twice, an hour apart. It
     * must still render at its canonical upstream rather than disappear.
     */
    it('keeps a curated pillar routable even when the live snapshot omits it', async () => {
      const transport = makeTransport(
        PILLARS.filter((id) => id !== 'contacts').map((id) => ({
          pillarId: id,
          baseUrl: `http://${PILLAR_UPSTREAMS[id].host}:${PILLAR_UPSTREAMS[id].port}`,
        }))
      );
      const rendered = await renderNginxConfDynamic('http://registry-api:3001', transport);
      expect(rendered).toContain('location /contacts-api/ {');
      const { host, port } = PILLAR_UPSTREAMS.contacts;
      expect(rendered).toContain(`set $contacts_api_upstream http://${host}:${port};`);
    });

    it('renders a single external pillar with parsed host:port, alongside every curated pillar', async () => {
      const transport = makeTransport([
        { pillarId: 'plugin-fitness', baseUrl: 'http://fitness-api:4242' },
      ]);
      const rendered = await renderNginxConfDynamic('http://registry-api:3001', transport);
      expect(rendered).toContain('location /plugin-fitness-api/ {');
      expect(rendered).toContain('set $plugin_fitness_api_upstream http://fitness-api:4242;');
      expect(rendered).toContain('location /finance-api/ {');
      expect(rendered).not.toContain('trpc');
    });

    it('mixes known + external pillars and orders known first', async () => {
      const transport = makeTransport([
        { pillarId: 'plugin-fitness', baseUrl: 'http://fitness-api:4242' },
        { pillarId: 'finance', baseUrl: 'http://localhost:9999' },
      ]);
      const rendered = await renderNginxConfDynamic('http://registry-api:3001', transport);
      const financeIdx = rendered.indexOf('location /finance-api/ {');
      const fitnessIdx = rendered.indexOf('location /plugin-fitness-api/ {');
      expect(financeIdx).toBeGreaterThan(-1);
      expect(fitnessIdx).toBeGreaterThan(-1);
      expect(financeIdx).toBeLessThan(fitnessIdx);
      const { host, port } = PILLAR_UPSTREAMS.finance;
      expect(rendered).toContain(`set $finance_api_upstream http://${host}:${port};`);
    });

    it('is deterministic — transport returning the same snapshot yields byte-identical output', async () => {
      const pillars = [
        { pillarId: 'finance', baseUrl: 'http://finance-api:3004' },
        { pillarId: 'plugin-z', baseUrl: 'http://z:1' },
      ];
      const a = await renderNginxConfDynamic('http://registry-api:3001', makeTransport(pillars));
      const b = await renderNginxConfDynamic('http://registry-api:3001', makeTransport(pillars));
      expect(a).toBe(b);
    });

    /**
     * The orchestrator self-registers, so a live snapshot lists it beside the
     * pillars. Rendering a per-entry block for it as well produced a second
     * `location /orchestrator-api/`, which nginx rejects with `[emerg]
     * duplicate location` — every route in the file goes down, not just that
     * one. Mirrors the production snapshot exactly.
     */
    it('renders one orchestrator block for a live-shaped snapshot that includes the orchestrator', async () => {
      const transport = makeTransport([
        ...PILLARS.map((id) => ({
          pillarId: id,
          baseUrl: `http://${PILLAR_UPSTREAMS[id].host}:${PILLAR_UPSTREAMS[id].port}`,
        })),
        { pillarId: 'documents', baseUrl: 'http://documents-api:3012' },
        { pillarId: 'orchestrator', baseUrl: 'http://pops-orchestrator:3009' },
      ]);
      const rendered = await renderNginxConfDynamic('http://registry-api:3001', transport);

      expect(rendered.match(/location \/orchestrator-api\/ \{/g)).toHaveLength(1);
      for (const id of PILLARS) {
        expect(rendered).toContain(`location /${id}-api/ {`);
      }
      expect(rendered).toContain('location /documents-api/ {');
    });

    /**
     * Broader guard than the orchestrator case above: nginx refuses to load a
     * config with any repeated `location` directive, so a collision between a
     * registry-driven block and a fixed template block is always fatal. Assert
     * uniqueness across the whole rendered file rather than per known offender.
     */
    it('never emits the same location directive twice', async () => {
      const transport = makeTransport([
        ...PILLARS.map((id) => ({
          pillarId: id,
          baseUrl: `http://${PILLAR_UPSTREAMS[id].host}:${PILLAR_UPSTREAMS[id].port}`,
        })),
        { pillarId: 'documents', baseUrl: 'http://documents-api:3012' },
        { pillarId: 'orchestrator', baseUrl: 'http://pops-orchestrator:3009' },
        { pillarId: 'plugin-fitness', baseUrl: 'http://fitness-api:4242' },
      ]);
      const rendered = await renderNginxConfDynamic('http://registry-api:3001', transport);

      const directives = [...rendered.matchAll(/^\s*location\s+(.+?)\s*\{/gm)].map((m) => m[1]);
      expect(directives.length).toBeGreaterThan(0);
      expect(new Set(directives).size).toBe(directives.length);
    });
  });

  describe('parseCliArgs', () => {
    it('defaults: static mode, default output, default registry url', () => {
      const opts = parseCliArgsForGenerator([]);
      expect(opts.dynamic).toBe(false);
      expect(opts.check).toBe(false);
      expect(opts.registryUrl).toBe(resolveRegistryUrl(process.env));
    });

    it('parses --dynamic', () => {
      expect(parseCliArgsForGenerator(['--dynamic']).dynamic).toBe(true);
    });

    it('parses --check', () => {
      expect(parseCliArgsForGenerator(['--check']).check).toBe(true);
    });

    it('parses --registry-url with a separate value', () => {
      const opts = parseCliArgsForGenerator(['--registry-url', 'http://other:9000']);
      expect(opts.registryUrl).toBe('http://other:9000');
    });

    it('parses --registry-url=… inline', () => {
      const opts = parseCliArgsForGenerator(['--registry-url=http://inline:1234']);
      expect(opts.registryUrl).toBe('http://inline:1234');
    });

    it('parses --out with a separate path and --out= inline', () => {
      expect(parseCliArgsForGenerator(['--out', '/tmp/a.conf']).outputPath).toBe('/tmp/a.conf');
      expect(parseCliArgsForGenerator(['--out=/tmp/b.conf']).outputPath).toBe('/tmp/b.conf');
    });

    it('throws on unknown flags', () => {
      expect(() => parseCliArgsForGenerator(['--what'])).toThrow(/unknown argument/);
    });

    it('throws when --registry-url has no value', () => {
      expect(() => parseCliArgsForGenerator(['--registry-url'])).toThrow(/--registry-url/);
      expect(() => parseCliArgsForGenerator(['--registry-url='])).toThrow(/non-empty URL/);
    });
  });
});
