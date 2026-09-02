/**
 * Tail of the generated `nginx.conf`: the fixed routes that follow the
 * per-pillar REST surfaces — the relocated raw routes, the media image and
 * registry proxies, the docs browser, and the SPA fallback.
 *
 * Kept in its own module so `nginx-conf-template.ts` stays focused on the
 * head; the generator concatenates head → REST intro → per-pillar blocks →
 * orchestrator → this. Editing any text below changes the committed
 * `nginx.conf` — the drift-detection test fails until `pnpm gen:nginx` is
 * re-run.
 */
export const NGINX_CONF_TAIL = `    # Relocated raw routes (02): Up Bank webhook → finance pillar; inventory
    # photo/document byte routes → inventory pillar. Variable-form proxy_pass
    # so pops-shell still boots when an upstream is absent.
    location /webhooks/up {
        set $up_webhook_upstream http://finance-api:3004;
        proxy_pass $up_webhook_upstream;
        proxy_set_header Host $host;
        proxy_read_timeout 30s;
    }

    location ~ ^/(api/inventory|inventory/documents)/ {
        set $inventory_upstream http://inventory-api:3002;
        proxy_pass $inventory_upstream;
        proxy_set_header Host $host;
    }

    # Proxy media images (posters, backdrops) served by the media pillar
    # On-demand downloads from TMDB/TVDB may take a few seconds on first request
    # Cache headers are set by the API — don't override with expires/add_header
    #
    # Variable-form \`proxy_pass\` (like every other upstream here) so the
    # shell boots even when media-api is unreachable — a registry-driven
    # boot-render must never hard-fail the image on an absent pillar.
    # The location prefix matches the upstream path, so the bare host:port
    # variable plus the unchanged \`$request_uri\` resolves to the
    # \`http://media-api:3003/media/images/\` target.
    location /media/images/ {
        set $media_images_upstream http://media-api:3003;
        proxy_pass $media_images_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_connect_timeout 10s;
        proxy_read_timeout 30s;
        proxy_send_timeout 30s;
    }

    # Proxy health check — served by the registry pillar (formerly core).
    # Variable-form so the shell still boots when registry-api is absent (the
    # request URI flows through unchanged, hitting registry-api's /health).
    location /health {
        set $health_upstream http://registry-api:3001;
        proxy_pass $health_upstream;
    }

    # Registry pillar snapshot (ADR-026 phase 3 PR 4). The shell's
    # \`fetchPillarRegistry\` hits \`/pillars\` at boot; route it to registry-api
    # which is the authoritative source. \`/pillars/health\` is served by the
    # same registry pillar (the monolith aggregator that previously owned it is
    # gone after the 02 decommission).
    #
    # Regex match so /pillars and /pillars/ both reach the upstream (and
    # similarly for /pillars/health). nginx forbids a URI part on
    # \`proxy_pass\` inside a regex location, so the upstream is the bare
    # host:port and the original \`$request_uri\` flows through unchanged.
    # Both upstreams are Express with default \`strict routing: off\` so
    # the trailing-slash and bare variants hit the same handler.
    #
    # The registry-api upstream is stored in a variable so nginx defers DNS
    # resolution to request time. Hosts that haven't yet deployed
    # \`pops-registry\` would otherwise fail to boot pops-shell entirely
    # (\`host not found in upstream "registry-api"\`); with the variable form
    # the SPA stays up and \`/pillars\` returns 502 until the upstream is
    # in place — the correct failure mode.
    location ~ ^/pillars/?$ {
        set $pillars_upstream http://registry-api:3001;
        proxy_pass $pillars_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 10s;
        proxy_send_timeout 10s;
    }

    # Registry pillar SSE stream. \`GET /registry/subscribe\`
    # is a plain-HTTP Server-Sent-Events endpoint on the registry pillar (NOT
    # a tRPC subscription). Proxy buffering is disabled and the read
    # timeout is long so the stream stays open; the handler already sets
    # \`X-Accel-Buffering: no\` but we pin it here too. Variable-form
    # \`proxy_pass\` keeps pops-shell booting when registry-api is absent.
    location ~ ^/registry/subscribe/?$ {
        set $registry_subscribe_upstream http://registry-api:3001;
        proxy_pass $registry_subscribe_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_connect_timeout 5s;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # NOTE: \`/registry/{register,heartbeat,deregister}\` are deliberately
    # NOT exposed by this public nginx. Pillar registration runs entirely
    # within the docker network — each pillar-api boots and POSTs directly
    # to \`http://registry-api:3001/registry/register\` over the internal
    # bridge. Removing the public allow-list closes the only path an
    # external caller could have reached the registration surface from.

    location ~ ^/pillars/health/?$ {
        set $pillars_health_upstream http://registry-api:3001;
        proxy_pass $pillars_health_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 10s;
        proxy_send_timeout 10s;
    }

    # API docs browser.
    #
    # \`pops-docs\` is a tiny static nginx image serving Stoplight Elements
    # pointed at every contract package's OpenAPI snapshot. Variable-form
    # \`proxy_pass\` so pops-shell still boots if pops-docs is absent
    # (consistent with the rest of this file); requests to \`/docs/\` 502
    # in that case instead of failing the shell container.
    #
    # The trailing slash on \`proxy_pass\` strips the \`/docs/\` prefix
    # before forwarding so pops-docs's own nginx serves \`/\`, \`/catalog.json\`,
    # \`/openapi/<pillar>.json\`, and \`/healthz\` at their natural paths.
    location /docs/ {
        set $pops_docs_upstream http://pops-docs:80;
        proxy_pass $pops_docs_upstream/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 10s;
        proxy_send_timeout 10s;
    }

    # Design playground.
    #
    # \`pops-design\` is the design playground's static nginx image
    # (pillars/design). Same shape as \`/docs/\` above: variable-form
    # \`proxy_pass\` so the shell boots without it, and the trailing slash
    # strips the \`/design/\` prefix. The bundle is built with that prefix as
    # its base, so the asset URLs it emits come straight back through here.
    location /design/ {
        set $pops_design_upstream http://pops-design:80;
        proxy_pass $pops_design_upstream/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 10s;
        proxy_send_timeout 10s;
    }

    # SPA fallback — serve index.html for all routes.
    #
    # index.html is the only file naming the current asset hashes, so a
    # cached copy pins the browser to the previous deploy's bundle — which
    # /assets/'s \`immutable\` then serves forever, with nothing in the UI
    # saying so. Absent an explicit directive browsers fall back to
    # heuristic freshness, hence this one: \`no-cache\` revalidates on every
    # navigation while the ETag keeps the unchanged case a bodyless 304.
    #
    # The header belongs on this block rather than a \`location =
    # /index.html\` because both routes to the file end up here: \`/\` is
    # served by the index module from inside this location, and a deep link
    # like /settings reaches the last \`try_files\` argument, whose internal
    # redirect re-runs location matching and lands here again. Hashed
    # assets are unaffected — /assets/ and the .mjs regex match first.
    location / {
        add_header Cache-Control "no-cache, must-revalidate";
        try_files $uri $uri/ /index.html;
    }
}
`;
