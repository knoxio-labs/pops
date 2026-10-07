/**
 * Guest gate for the generated `nginx.conf`: a coarse refusal in front of
 * every location that proxies to a pillar backend.
 *
 * A request Cloudflare Access identified carries
 * `Cf-Access-Authenticated-User-Email`. An email outside the operator list is
 * a guest, and a guest gets a 403 everywhere except under
 * `GUEST_PATH_PREFIXES`. A request with no such header (LAN, Tailscale, dev)
 * is the operator.
 *
 * The gate trusts a header, not a signature. It holds only while Cloudflare
 * overwrites a client-supplied copy of that header; the token checks inside
 * the pillars do not depend on it.
 *
 * The operator list is `POPS_OPERATOR_EMAILS` in the shell container's
 * environment. While it is unset the map classifies nobody as a guest, so the
 * rendered conf routes exactly as it did before the gate existed.
 */

/** Environment variable holding the comma-separated operator emails. */
export const OPERATOR_EMAILS_ENV = 'POPS_OPERATOR_EMAILS';

/**
 * Path prefixes a guest may reach. A prefix equal to a pillar's whole
 * `/<id>-api/` surface leaves that pillar's block unguarded; a narrower one
 * renders as its own unguarded location ahead of the pillar's guarded block.
 */
export const GUEST_PATH_PREFIXES: readonly string[] = ['/finance-api/', '/registry-api/'];

/** Internal location that answers a refused guest. */
export const GUEST_FORBIDDEN_LOCATION = '/__pops_guest_forbidden';

/**
 * The guard a gated location carries. A rewrite to an internal location, not
 * a bare `return 403`, because `return` inside `if` cannot set the JSON
 * content type and a server-wide `error_page 403` would relabel every other
 * 403 nginx generates. It must follow the location's `set`, which a
 * `rewrite ... break` placed first would skip.
 */
export const GUEST_GUARD = `        if ($pops_guest) { rewrite ^ ${GUEST_FORBIDDEN_LOCATION} last; }`;

/** The refusal itself, in the ADR-054 envelope. Rendered inside `server`. */
export const NGINX_CONF_GUEST_FORBIDDEN = `    location = ${GUEST_FORBIDDEN_LOCATION} {
        internal;
        default_type application/json;
        return 403 '{"code":"gateway.guest_forbidden","message":"This account cannot access this resource.","requestId":"$pops_request_id","retryable":false}';
    }
`;

/** What the renderers accept to shape the gate. */
export interface GuestGateOptions {
  /** Raw `POPS_OPERATOR_EMAILS` value. Absent or blank renders an inert gate. */
  readonly operatorEmails?: string;
  /** Overrides `GUEST_PATH_PREFIXES`. */
  readonly guestPathPrefixes?: readonly string[];
}

/** Result of reading a raw operator list. */
export interface OperatorEmails {
  /** True once the list names at least one entry, valid or not. */
  readonly enforced: boolean;
  /** Normalised, de-duplicated emails safe to write into the conf. */
  readonly emails: readonly string[];
  /** Entries dropped because they are not a plain email address. */
  readonly rejected: readonly string[];
}

// Deliberately narrower than RFC 5322: every accepted character is inert
// inside a double-quoted nginx map key, so an entry can never close the quote
// or the map and inject configuration.
const SAFE_EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;

const GUEST_PREFIX_SHAPE = /^\/[a-z0-9-]+-api\/(?:[A-Za-z0-9._-]+\/)*$/;

/**
 * Parse a raw `POPS_OPERATOR_EMAILS` value. Entries are trimmed and
 * lower-cased; nginx matches map keys case-insensitively. A malformed entry
 * is dropped, and a list holding only malformed entries still enforces, so a
 * typo fails closed for identified users instead of silently opening the gate.
 */
export function parseOperatorEmails(raw: string | undefined): OperatorEmails {
  const entries = (raw ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  const emails = new Set<string>();
  const rejected = new Set<string>();
  for (const entry of entries) {
    if (SAFE_EMAIL.test(entry)) emails.add(entry);
    else rejected.add(entry);
  }
  return { enforced: entries.length > 0, emails: [...emails], rejected: [...rejected] };
}

/**
 * Read the operator list from an environment. Both render modes honour it,
 * so the boot entrypoint can re-render the static fallback with the same gate
 * as the live render. `--check` and a plain `pnpm gen:nginx` run without the
 * variable and so reproduce the committed, inert file.
 */
export function guestGateFromEnv(env: NodeJS.ProcessEnv): GuestGateOptions {
  const operatorEmails = env[OPERATOR_EMAILS_ENV];
  return operatorEmails === undefined ? {} : { operatorEmails };
}

/**
 * One stderr line naming how many operator entries were dropped, or an empty
 * string when none were. The entries themselves are not echoed.
 */
export function rejectedOperatorEmailsWarning(gate: GuestGateOptions): string {
  const count = parseOperatorEmails(gate.operatorEmails).rejected.length;
  if (count === 0) return '';
  const subject = count === 1 ? 'entry that is' : 'entries that are';
  return `generate-nginx-conf: ignoring ${count} ${OPERATOR_EMAILS_ENV} ${subject} not a plain email address\n`;
}

/**
 * The `map` that sets `$pops_guest`. Rendered at `http` level, ahead of the
 * `server` block.
 */
export function renderGuestMap(rawOperatorEmails: string | undefined): string {
  const { enforced, emails } = parseOperatorEmails(rawOperatorEmails);
  const header = [
    `# Guest gate. \`$pops_guest\` is 1 for a request Cloudflare Access identified`,
    `# as someone outside ${OPERATOR_EMAILS_ENV}. No header means LAN, Tailscale or`,
    `# dev, which is the operator. With the list unset nobody is a guest.`,
    `map $http_cf_access_authenticated_user_email $pops_guest {`,
  ];
  if (!enforced) return [...header, `    default 0;`, `}`, ''].join('\n');
  return [
    ...header,
    `    default 1;`,
    `    "" 0;`,
    ...emails.map((email) => `    "${email}" 0;`),
    `}`,
    '',
  ].join('\n');
}

function assertGuestPrefixShape(prefix: string): void {
  if (!GUEST_PREFIX_SHAPE.test(prefix)) {
    throw new Error(
      `nginx-guest-gate: guest path prefix "${prefix}" must look like /<id>-api/ or /<id>-api/<segment>/`
    );
  }
}

/** True when `path` sits under one of the guest prefixes. */
export function isGuestPath(
  path: string,
  prefixes: readonly string[] = GUEST_PATH_PREFIXES
): boolean {
  return prefixes.some((prefix) => path.startsWith(prefix));
}

/** The guard line for a location serving `path`, or nothing under a guest prefix. */
export function guestGuardLines(
  path: string,
  prefixes: readonly string[] = GUEST_PATH_PREFIXES
): readonly string[] {
  return isGuestPath(path, prefixes) ? [] : [GUEST_GUARD];
}

/**
 * Guest prefixes strictly inside the pillar surface `pillarPrefix`
 * (`/<id>-api/`), in a stable order. Empty when the whole surface is already
 * a guest prefix: nothing narrower needs carving out of an unguarded block.
 */
export function narrowerGuestPrefixes(
  pillarPrefix: string,
  prefixes: readonly string[] = GUEST_PATH_PREFIXES
): readonly string[] {
  prefixes.forEach(assertGuestPrefixShape);
  if (prefixes.includes(pillarPrefix)) return [];
  const narrower = prefixes.filter((prefix) => prefix.startsWith(pillarPrefix));
  return [...new Set(narrower)].toSorted((a, b) => a.localeCompare(b, 'en'));
}
