/**
 * The two generated per-pillar location blocks: the REST surface every pillar
 * serves, and the UI bundle a loader-mounted one is fetched from.
 *
 * Split out of `generate-nginx-conf.ts` so that file stays about deciding
 * WHICH pillars to render and in what order, while this one is about what a
 * single pillar's blocks look like.
 */
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
 * overridden in the same nginx location.
 */
export function renderEgoStreamBlock(upstream: PillarUpstream): string {
  return [
    `    location = ${EGO_STREAM_LOCATION} {`,
    `        set $cerebrum_ego_stream_upstream http://${upstream.host}:${upstream.port};`,
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

/**
 * REST surface dispatcher (`/<pillar>-api/`) for one pillar. Mirrors the
 * media block byte-for-byte: strip the `/<pillar>-api` prefix down to
 * `/` so the pillar's own router sees its natural paths, then proxy to
 * the variable-form upstream and inherit the shared proxy directives.
 */
export function renderPillarRestBlockFromUpstream(upstream: PillarUpstream): string {
  const varName = nginxVarName(upstream.pillarId);
  const restBlock = [
    `    location /${upstream.pillarId}-api/ {`,
    `        set $${varName}_api_upstream http://${upstream.host}:${upstream.port};`,
    `        rewrite ^/${upstream.pillarId}-api/(.*)$ /$1 break;`,
    `        proxy_pass $${varName}_api_upstream;`,
    `        include /etc/nginx/snippets/_pillar-proxy.conf;`,
    `    }`,
  ].join('\n');

  if (upstream.pillarId !== 'cerebrum') return restBlock;
  return `${renderEgoStreamBlock(upstream)}\n\n${restBlock}`;
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
 * from the frontend; the variable-form `proxy_pass` already makes an absent
 * upstream a 502 on that path alone rather than a boot failure, which is the
 * same failure mode as a pillar whose API container is not deployed.
 */
export function renderPillarUiBlock(upstream: PillarUpstream): string {
  const varName = nginxVarName(upstream.pillarId);
  return [
    `    location /${upstream.pillarId}-ui/ {`,
    `        set $${varName}_ui_upstream http://${upstream.pillarId}-ui:80;`,
    `        rewrite ^/${upstream.pillarId}-ui/(.*)$ /$1 break;`,
    `        proxy_pass $${varName}_ui_upstream;`,
    `        include /etc/nginx/snippets/_pillar-proxy.conf;`,
    `    }`,
  ].join('\n');
}
