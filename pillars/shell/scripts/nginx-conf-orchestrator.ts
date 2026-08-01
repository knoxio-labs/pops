/**
 * Federated-search orchestrator REST surface (ADR-029, epic 06).
 *
 * The orchestrator is a registry participant like any pillar — it registers on
 * boot and shows up in the discovery snapshot — but it is not a *curated*
 * pillar: it owns no data and fans out over the pillars instead, so it is
 * absent from `PILLARS` / `PILLAR_UPSTREAMS` and its route is emitted as a
 * single fixed block (rather than one-per-pillar). The shell's
 * global search panel (`@pops/navigation` `useSearchInputData`) posts to
 * `/orchestrator-api/search`; the block strips the `/orchestrator-api` prefix
 * so the orchestrator router sees its natural `/search`, then proxies to the
 * variable-form upstream and inherits the shared proxy directives (mirrors the
 * `/<pillar>-api/` blocks).
 *
 * Kept in its own module so `nginx-conf-template.ts` stays focused on the
 * pillar-shaped fragments; the generator concatenates this block between the
 * per-pillar REST surfaces and the tail.
 */
/**
 * Registry id the orchestrator registers itself under. Because it is in the
 * snapshot, the dynamic renderer would emit a second `location
 * /orchestrator-api/` on top of the fixed block below — nginx rejects a
 * duplicate prefix location outright and refuses to load the whole config.
 * Exported so the generator can skip it.
 */
export const ORCHESTRATOR_PILLAR_ID = 'orchestrator';

export const NGINX_CONF_ORCHESTRATOR = `    # ── Federated-search orchestrator (ADR-029, epic 06) ──
    #
    # Non-pillar cross-cutting service: federates search over the pillars
    # and serves \`POST /search\` at root. The shell's global search panel
    # posts to \`/orchestrator-api/...\`; strip the prefix so the
    # orchestrator router sees its natural paths, then proxy to the
    # variable-form upstream (boots even when the orchestrator is absent).

    location /orchestrator-api/ {
        set $orchestrator_api_upstream http://pops-orchestrator:3009;
        rewrite ^/orchestrator-api/(.*)$ /$1 break;
        proxy_pass $orchestrator_api_upstream;
        include /etc/nginx/snippets/_pillar-proxy.conf;
    }
`;
