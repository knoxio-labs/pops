/**
 * What a paired handset may do, enumerated (ADR-048).
 *
 * A capability is the unit of authorisation on the `/mobile` surface. A device
 * grant is a set of them, a route declares the one it requires, and the gate
 * compares the two — the HTTP verb takes no part in the decision. Holding one
 * implies nothing about any other: `purchases.receipts.write` does not imply
 * `purchases.read`, and neither implies anything under `media`.
 *
 * That is the whole reason this file is a closed list rather than a convention
 * about string shape. "What can a phone do" has to be a question with an
 * answer somebody can read, and widening it has to be a diff somebody can see.
 *
 * ## Two axes, both of which must permit a call
 *
 * A capability is NOT a service-account scope (ADR-044), and conflating them
 * is the mistake this file is arranged to prevent:
 *
 * - the **capability** says what this handset may ask bfm for;
 * - the **scope** says what bfm's own credential may ask a sibling pillar for.
 *
 * A device granted `purchases.read` still gets a `403` from `purchases` unless
 * bfm's account carries the matching scope, and widening bfm's account grants
 * no handset anything. {@link MOBILE_CAPABILITY_SCOPES} records which scope
 * each capability leans on so the two can be checked against each other; a
 * test in `api/pillars/__tests__/service-account.test.ts` fails when a
 * capability names a scope `BFM_SERVICE_ACCOUNT_SCOPES` does not carry.
 */

/**
 * The vocabulary. Every value is dotted `<pillar>.<thing>.<verb-ish>` except
 * {@link MOBILE_SESSION_CAPABILITY}, which is about the session rather than
 * about any pillar's data.
 *
 * Adding one is a decision, not a formality — see ADR-048 for the two kinds of
 * operation that do not get a capability at all (destructive, and
 * administrative), which is the distinction that replaced the verb ban.
 */
export const MOBILE_CAPABILITIES = [
  /** Reach the bootstrap payload: who the federation says it is talking to. */
  'session.read',
  'finance.transactions.read',
  /**
   * Read every account this device can see, active and archived alike — the
   * accounts list, and the balance, provenance and month-end history behind
   * one account's dashboard.
   */
  'finance.accounts.read',
  /**
   * Read an order and the page it sits on. Deliberately NOT implied by
   * {@link MOBILE_CAPABILITIES}' receipt-write entry: handing a phone the
   * ability to photograph a till slip is not the same as handing it a
   * scrollable history of everything the household has bought.
   */
  'purchases.read',
  /**
   * Fetch the stored bytes behind a receipt's `pops://` URI — the photograph
   * itself, or the thumbnail a list row draws.
   *
   * Its own entry rather than part of {@link MOBILE_CAPABILITIES}' order-read
   * entry, because the two disclose different things. A list of orders says
   * what was bought and for how much; the photograph is the paper, and it
   * carries whatever else was on it — a card's last four digits, a loyalty
   * number, a pharmacy line item. Reading the summary and being handed the
   * original are worth being able to grant apart.
   */
  'purchases.receipts.read',
  'purchases.receipts.write',
] as const;

export type MobileCapability = (typeof MOBILE_CAPABILITIES)[number];

/**
 * The capability every paired device needs to get past its own launch. Named
 * rather than spelled out at the call site: bootstrap is the one route whose
 * absence from a grant would make the app unusable rather than degraded.
 */
export const MOBILE_SESSION_CAPABILITY: MobileCapability = 'session.read';

/**
 * The downstream scope each capability leans on, or `null` when it needs none.
 *
 * `null` is a real answer rather than a gap: bootstrap probes the federation
 * through the SDK's discovery cache and calls no pillar's domain surface, so
 * there is no grant on bfm's account that could authorise or refuse it.
 *
 * The values are dot PREFIXES, matching how ADR-044 scopes match — `purchases.receipt`
 * authorises `purchases.receipt.upload` and nothing under `purchases.purchase`.
 */
export const MOBILE_CAPABILITY_SCOPES: Readonly<Record<MobileCapability, string | null>> = {
  'session.read': null,
  'finance.transactions.read': 'finance.transactions',
  'finance.accounts.read': 'finance.accounts',
  'purchases.read': 'purchases.purchase',
  /**
   * The same prefix the upload leans on, because both are purchases' own
   * `receipt.*` module — the bytes are that module's artifact, written by its
   * store and named by its hash. Worth stating plainly: bfm's account already
   * carried this prefix for the upload, so no grant widens when this
   * capability lands. The separation between photographing a receipt and
   * reading one back is drawn at the CAPABILITY, above, which is the axis
   * that is per-device; the scope is per-module and always was.
   */
  'purchases.receipts.read': 'purchases.receipt',
  'purchases.receipts.write': 'purchases.receipt',
};

/**
 * What pairing grants a new handset.
 *
 * The whole vocabulary today, and that is a deliberate starting point rather
 * than an assumption baked into the model: there is exactly one handset, it is
 * the operator's own, and granting it less than the app needs would be
 * ceremony. What the model buys is that narrowing a grant is now expressible
 * at all — see ADR-048's consequences for the operator surface that will do it.
 */
export const DEFAULT_DEVICE_CAPABILITIES: readonly MobileCapability[] = MOBILE_CAPABILITIES;

const CAPABILITY_SET: ReadonlySet<string> = new Set<string>(MOBILE_CAPABILITIES);

/** Whether a string is a capability this build knows about. */
export function isMobileCapability(value: string): value is MobileCapability {
  return CAPABILITY_SET.has(value);
}

/**
 * What a `/mobile` route declares beside its path.
 *
 * On the contract rather than in a table beside it, so a route and the
 * authority it requires cannot be added in two different commits — the shape
 * ADR-045 asks for, applied to authorisation.
 */
export interface MobileRouteMetadata {
  readonly capability: MobileCapability;
}

/**
 * Declare a route's required capability.
 *
 * A function rather than an object literal at each call site because
 * ts-rest types `metadata` as `unknown`: written inline, a typo in the key
 * would compile and read as a route that declares nothing, which the guard
 * would then have to catch on a path a reviewer already believed was covered.
 */
export function requires(capability: MobileCapability): MobileRouteMetadata {
  return { capability };
}

/**
 * Read a capability back off a route's metadata.
 *
 * Returns `null` for anything that is not a declaration this module produced —
 * absent, the wrong shape, or a string outside the vocabulary. Every caller
 * treats `null` as "this route is not reachable", so a metadata object that
 * drifted out of shape fails closed rather than being read as permissive.
 */
export function readRouteCapability(metadata: unknown): MobileCapability | null {
  if (typeof metadata !== 'object' || metadata === null) return null;
  if (!('capability' in metadata)) return null;
  const value = (metadata as { capability: unknown }).capability;
  if (typeof value !== 'string') return null;
  return isMobileCapability(value) ? value : null;
}

/**
 * Read a device's stored grant.
 *
 * The column holds JSON so the grant can grow without a migration per
 * capability. Anything that is not an array of strings yields an empty grant
 * and a warning: a row nobody can parse must authorise nothing, and silently
 * substituting the default set there would turn a corrupted column into a
 * full-access device.
 *
 * Unknown strings are KEPT rather than dropped. A grant written by a newer
 * build and read by an older one is a real deployment state, and the older
 * build simply matches none of what it does not know — where dropping them
 * would rewrite the row's meaning the first time anything persisted it back.
 */
export function parseDeviceCapabilities(stored: string, deviceId: string): readonly string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    warnUnreadableGrant(deviceId);
    return [];
  }
  if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === 'string')) {
    warnUnreadableGrant(deviceId);
    return [];
  }
  return parsed;
}

function warnUnreadableGrant(deviceId: string): void {
  console.warn(
    `[bfm-api] device ${deviceId} carries an unreadable capability grant; treating it as empty`
  );
}

/** Serialise a grant for the column. */
export function serialiseDeviceCapabilities(capabilities: readonly string[]): string {
  return JSON.stringify(capabilities);
}
