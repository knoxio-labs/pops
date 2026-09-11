/**
 * The fleet-wide soft cross-pillar reference grammar (ADR-042):
 * `pops://<pillar>/<type>/<id>`. A soft reference names another pillar's row
 * without a foreign key — the referencing table only carries the URI plus a
 * `staleAt` companion, cleared or set by whichever nightly cron resolves it.
 */
export interface ParsedUri {
  pillar: string;
  type: string;
  id: string;
}

/**
 * Parse `pops://<pillar>/<type>/<id>`. Returns `null` for any shape that
 * isn't a well-formed soft reference — callers treat that as a bad URI: an
 * ops-visible warning, with the referencing row left untouched rather than
 * marked stale on the strength of a string that was never a reference.
 *
 * The id segment is greedy and may itself contain `/` (kept whole, not
 * split further), because an owning pillar's own id format is not this
 * grammar's concern.
 */
export function parseSoftUri(uri: string): ParsedUri | null {
  const match = /^pops:\/\/([^/]+)\/([^/]+)\/(.+)$/.exec(uri);
  if (!match) return null;
  const [, pillar, type, id] = match;
  if (!pillar || !type || !id) return null;
  return { pillar, type, id };
}
