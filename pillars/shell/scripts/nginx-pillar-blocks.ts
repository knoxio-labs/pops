/**
 * The two generated per-pillar location blocks: the REST surface every pillar
 * serves, and the UI bundle a loader-mounted one is fetched from.
 *
 * Split out of `generate-nginx-conf.ts` so that file stays about deciding
 * WHICH pillars to render and in what order, while this one is about what a
 * single pillar's blocks look like.
 */
import { NGINX_CONF_REST_INTRO, NGINX_CONF_UI_INTRO } from './nginx-conf-template.js';
import { GUEST_PATH_PREFIXES, guestGuardLines, narrowerGuestPrefixes } from './nginx-guest-gate.js';

import type { PillarId } from '@pops/pillar-sdk';

export interface PillarUpstream {
  readonly pillarId: PillarId;
  readonly host: string;
  readonly port: number;
}

/** Exact public route for Cerebrum's server-sent Ego chat stream. */
export const EGO_STREAM_LOCATION = '/cerebrum-api/ego/chat/stream';

/** nginx variable names take no hyphens. */
export function nginxVarName(pillarId: PillarId): string {
  return pillarId.replace(/-/g, '_');
}

/**
 * Cerebrum's raw SSE stream route. The proxy headers are inlined because the
 * shared REST snippet sets shorter read/send timeouts that cannot be
 * overridden in the same nginx location. Guests are refused unless the route
 * sits under a guest prefix.
 */
export function renderEgoStreamBlock(
  upstream: PillarUpstream,
  guestPathPrefixes: readonly string[] = GUEST_PATH_PREFIXES
): string {
  return [
    `    location = ${EGO_STREAM_LOCATION} {`,
    `        set $cerebrum_ego_stream_upstream http://${upstream.host}:${upstream.port};`,
    ...guestGuardLines(EGO_STREAM_LOCATION, guestPathPrefixes),
    `        rewrite ^/cerebrum-api/(.*)$ /$1 break;`,
    `        proxy_pass $cerebrum_ego_stream_upstream;`,
    `        proxy_http_version 1.1;`,
    `        proxy_set_header Host $host;`,
    `        proxy_set_header X-Real-IP $remote_addr;`,
    `        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`,
    `        proxy_set_header X-Forwarded-Proto $scheme;`,
    `        proxy_set_header X-Request-Id $pops_request_id;`,
    `        proxy_set_header Connection '';`,
    `        proxy_buffering off;`,
    `        proxy_cache off;`,
    `        proxy_connect_timeout 5s;`,
    `        proxy_read_timeout 300s;`,
    `        proxy_send_timeout 300s;`,
    `    }`,
  ].join('\n');
}

function renderRestLocation(
  upstream: PillarUpstream,
  location: string,
  guestPathPrefixes: readonly string[]
): string {
  const varName = nginxVarName(upstream.pillarId);
  return [
    `    location ${location} {`,
    `        set $${varName}_api_upstream http://${upstream.host}:${upstream.port};`,
    ...guestGuardLines(location, guestPathPrefixes),
    `        rewrite ^/${upstream.pillarId}-api/(.*)$ /$1 break;`,
    `        proxy_pass $${varName}_api_upstream;`,
    `        include /etc/nginx/snippets/_pillar-proxy.conf;`,
    `    }`,
  ].join('\n');
}

/**
 * REST surface dispatcher (`/<pillar>-api/`) for one pillar: strip the
 * `/<pillar>-api` prefix down to `/` so the pillar's own router sees its
 * natural paths, then proxy to the variable-form upstream and inherit the
 * shared proxy directives.
 *
 * The block refuses guests unless the whole surface is a guest prefix. A
 * guest prefix narrower than the surface is emitted as its own unguarded
 * location ahead of the pillar's block; nginx picks the longest matching
 * prefix, so only that sub-path is opened.
 */
export function renderPillarRestBlockFromUpstream(
  upstream: PillarUpstream,
  guestPathPrefixes: readonly string[] = GUEST_PATH_PREFIXES
): string {
  const pillarPrefix = `/${upstream.pillarId}-api/`;
  const blocks = [...narrowerGuestPrefixes(pillarPrefix, guestPathPrefixes), pillarPrefix].map(
    (location) => renderRestLocation(upstream, location, guestPathPrefixes)
  );
  if (upstream.pillarId === 'cerebrum') {
    blocks.unshift(renderEgoStreamBlock(upstream, guestPathPrefixes));
  }
  return blocks.join('\n\n');
}

/** Emits the shared-memory upstream group that resolves one pillar's UI service. */
export function renderPillarUiUpstream(upstream: PillarUpstream): string {
  const varName = nginxVarName(upstream.pillarId);
  return [
    `upstream pops_ui_${varName} {`,
    `    zone pops_ui_${varName} 64k;`,
    `    server ${upstream.pillarId}-ui:80 resolve;`,
    `    resolver 127.0.0.11 valid=30s ipv6=off;`,
    `}`,
  ].join('\n');
}

/**
 * UI-bundle surface (`/<pillar>-ui/`) for one pillar.
 *
 * A pillar whose UI the shell mounts through its runtime loader
 * (`pillars/shell/src/app/external-ui.tsx`) advertises an `assetsBaseUrl` and
 * the shell `import()`s it. Root-relative, so the module request is
 * same-origin — which is what lets the shell's shared-runtime import map
 * govern the bare specifiers inside that bundle. An off-origin URL would need
 * a CORS posture and would still have to name a hostname the pillar cannot
 * know, since one deployment answers to a LAN name, a Tailscale name and
 * `localhost` at once.
 *
 * Emitted for EVERY pillar, from the convention `<pillar>-ui:80`, rather than
 * for the ones that happen to have a UI today. A per-pillar list here is the
 * central enumeration ADR-039 Invariant 5 removes and POPS-3215 is deleting
 * from the frontend. The shared-memory upstream resolves optional UI
 * containers asynchronously, so an absent UI affects only its own route.
 *
 * Not guest-gated: a bundle is public code and holds no private data.
 */
export function renderPillarUiBlock(upstream: PillarUpstream): string {
  const varName = nginxVarName(upstream.pillarId);
  return [
    `    location /${upstream.pillarId}-ui/ {`,
    `        rewrite ^/${upstream.pillarId}-ui/(.*)$ /$1 break;`,
    `        proxy_pass http://pops_ui_${varName};`,
    `        include /etc/nginx/snippets/_ui-proxy.conf;`,
    `    }`,
  ].join('\n');
}

/**
 * The per-pillar part of the conf: every REST block under its intro, then
 * every UI block under its intro. Empty for no upstreams, so a registry with
 * nothing to route renders head, orchestrator and tail alone.
 */
export function renderPillarSections(
  upstreams: readonly PillarUpstream[],
  guestPathPrefixes: readonly string[] = GUEST_PATH_PREFIXES
): string {
  if (upstreams.length === 0) return '';
  const restBlocks = upstreams
    .map((upstream) => renderPillarRestBlockFromUpstream(upstream, guestPathPrefixes))
    .join('\n\n');
  const uiBlocks = upstreams.map(renderPillarUiBlock).join('\n\n');
  return `${NGINX_CONF_REST_INTRO}\n${restBlocks}\n\n${NGINX_CONF_UI_INTRO}\n${uiBlocks}\n\n`;
}

/** UI upstream groups share DNS state across workers and refresh in the background. */
export function renderPillarUiUpstreams(upstreams: readonly PillarUpstream[]): string {
  return upstreams.map(renderPillarUiUpstream).join('\n\n');
}
