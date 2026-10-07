# nginx render pipeline

The shell's production image is `nginx:1.31.3-alpine` plus a node binary — nginx serves
the requests, Node only renders and reloads the conf — so everything that
decides nginx routing happens here, at one of the moments below. Each file's own
header explains what it does; this page is the ordering across them.

## Lifecycle

| When                    | Entrypoint                                        | Effect                                                                                                  |
| ----------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Authoring / CI          | `generate-nginx-conf.ts` (static, `--check`)      | Renders the committed `../nginx.conf`. `--check` fails CI when it drifts.                               |
| Image build             | `bundle-nginx-tools.ts`                           | Bundles the render + watch CLIs for the runtime image.                                                  |
| Container boot          | `../docker-entrypoint.sh` → the render bundle     | Retries a failed live-registry render twice at one-second intervals, then falls back to the baked conf. |
| Container life          | `watch-registry-and-reload-cli.ts` (watch bundle) | Re-renders + validates + reloads on each registry SSE event.                                            |
| Deploy, outside the pod | `register-with-registry.ts`                       | Announces the shell to the registry. Never runs in the browser or in the image.                         |

The boot render and the watcher run the _same_ dynamic renderer; the watcher is
simply the long-lived repeat. `validate-nginx-conf.sh` is the local smoke check
and runs against Docker, not in the boot path.

## The three conf paths

Similar names, different roles:

| Path                             | Role                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `../nginx.conf`                  | Generated, committed, drift-gated. Baked into the image as the **fallback**. |
| `/etc/nginx/conf.d/default.conf` | The **served** conf. Boot render and watcher both write here.                |

Because a render lands on the served path _before_ it is validated, the
entrypoint overrides `POPS_NGINX_CONFIG_TEST_CMD` to keep a last-known-good copy
and restore it when `nginx -t` fails. The default test command is not
sufficient in the image — it would test the server-block fragment as a whole
config.

## Invariants that span files

- Every `proxy_pass` uses the variable form so nginx boots with an absent
  upstream. New upstreams must follow (`nginx-conf-template.ts`).
- Every proxied request carries the preserved-or-minted `X-Request-Id`. Shared
  pillar routes inherit it from `_pillar-proxy.conf`; fixed routes declare it
  beside their other proxy headers.
- Gateway error pages cover only nginx-generated 502, 503, and 504 responses.
  `proxy_intercept_errors` remains off so producer-owned bodies pass through.
- The dynamic renderer must skip the orchestrator's registry id — see
  `nginx-conf-orchestrator.ts`'s header for why.
- A failed validate skips the reload; the previously loaded conf stays live.
- Every location that proxies to a pillar backend refuses guests, unless it is
  under a guest prefix or is one of the public routes listed in
  `generate-nginx-conf.test.ts`. That test fails on a new unguarded proxy
  location. See `nginx-guest-gate.ts`.

## Guest gate and `POPS_OPERATOR_EMAILS`

The operator list is only known at boot, so the committed `../nginx.conf` is
rendered without one and its gate is inert. The entrypoint, the boot render and
the watcher all read `POPS_OPERATOR_EMAILS` from the container's environment:

- Unset: nobody is a guest, routing is unchanged, and the entrypoint logs one
  warning.
- Set: the entrypoint re-renders the fallback with the list before anything
  else, and exits if that render fails, so no path serves an open gate. A
  malformed entry is ignored with a warning; the gate still enforces.

Watcher env vars are listed in `watch-registry-and-reload.ts`'s header and the
health-endpoint payload in `nginx-generator-health.ts`'s; the `gen:nginx*`
script names are in `../package.json`.
