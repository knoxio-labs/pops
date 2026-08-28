/**
 * Static nginx-conf fragments used by `generate-nginx-conf.ts`.
 *
 * Split out so the generator's renderer stays small and the literal
 * blocks (which are essentially data) live next to each other. Order:
 * the renderer concatenates
 *   HEAD → REST_INTRO → <per-pillar /<id>-api/ blocks> → orchestrator → TAIL,
 * with the last two in `nginx-conf-orchestrator.ts` and `nginx-conf-tail.ts`.
 *
 * Editing any text below changes the committed `nginx.conf` — the
 * drift-detection test will fail until `pnpm gen:nginx` is re-run.
 */

export const NGINX_CONF_HEAD = `server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Bulk endpoints post the whole batch in one body — a two-year bank
    # statement reaches ~1.3MB at /finance-api/imports/process — so nginx's
    # 1m default rejects a normal import with a 413 before it ever reaches the
    # pillar. Matched to the 20mb the finance API declares on express.json so
    # one limit governs, and it is the one the application states.
    client_max_body_size 20m;

    # Resolver for variable-form \`proxy_pass\`. Upstreams held in an
    # nginx variable defer DNS resolution to request time (vs. config-
    # load time for literal \`proxy_pass <name>\`), letting nginx boot
    # even when an optional pillar container is missing. Every \`proxy_pass\`
    # in this file uses the variable form so the shell always boots — a
    # registry-driven boot-render must never hard-fail on an absent
    # pillar — and new upstreams must adopt the same form.
    resolver 127.0.0.11 valid=30s ipv6=off;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
    gzip_min_length 256;

    # Cache static assets aggressively (Vite hashes filenames)
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # nginx's bundled mime.types maps .js but not .mjs, so an emitted .mjs
    # asset is served as the octet-stream default_type. Browsers enforce a
    # JavaScript MIME type on module scripts and on workers, so such an
    # asset is refused and a module worker never starts. Vite emits .mjs
    # whenever a dependency ships one as an asset (the PDF reader's worker
    # is the first), and a regex location is needed because it must beat
    # the /assets/ prefix above; the caching directives are repeated for
    # that reason, not by oversight.
    location ~ \\.mjs$ {
        default_type application/javascript;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
`;

/**
 * Intro comment for the generated per-pillar REST surfaces. Heads the
 * `/<id>-api/` REST blocks the generator emits below it.
 */
export const NGINX_CONF_REST_INTRO = `    # ── Per-pillar REST surfaces (pillar migration cutover, generated) ──
    #
    # GENERATED FILE — do not hand-edit. Source:
    #   pillars/shell/scripts/generate-nginx-conf.ts
    #
    # Each collapsed pillar now serves an idiomatic REST contract at root
    # on its own container (\`/health\`, \`/pillars\`, \`/openapi\`, plus its
    # resource routes). The Hey API clients post to the shell's
    # \`/<pillar>-api/...\` prefix (e.g. \`/media-api/...\`, \`/registry-api/...\`);
    # each block strips the \`/<pillar>-api\` prefix so the pillar's own
    # router sees its natural paths, then proxies to the pillar container.
    #
    # Variable-form \`proxy_pass\` defers DNS to request time so pops-shell
    # still boots when a pillar container is absent; calls 502 until the
    # upstream is in place.
`;
