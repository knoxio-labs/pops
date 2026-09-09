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

/** nginx variable names take no hyphens. */
export function nginxVarName(pillarId: PillarId): string {
  return pillarId.replace(/-/g, '_');
}

/**
 * REST surface dispatcher (`/<pillar>-api/`) for one pillar. Mirrors the
 * media block byte-for-byte: strip the `/<pillar>-api` prefix down to
 * `/` so the pillar's own router sees its natural paths, then proxy to
 * the variable-form upstream and inherit the shared proxy directives.
 */
export function renderPillarRestBlockFromUpstream(upstream: PillarUpstream): string {
  const varName = nginxVarName(upstream.pillarId);
  return [
    `    location /${upstream.pillarId}-api/ {`,
    `        set $${varName}_api_upstream http://${upstream.host}:${upstream.port};`,
    `        rewrite ^/${upstream.pillarId}-api/(.*)$ /$1 break;`,
    `        proxy_pass $${varName}_api_upstream;`,
    `        include /etc/nginx/snippets/_pillar-proxy.conf;`,
    `    }`,
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
