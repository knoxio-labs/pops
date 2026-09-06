/**
 * Reads a `[tasks.<name>]` field straight out of a `mise.toml` source.
 *
 * Shared by the suites that exercise the REAL `run-all` task body rather than
 * a copy of it. Building the fixture out of the actual file is the point: a
 * transcribed copy would keep passing after the task it claims to test had
 * changed underneath it — the same reasoning AGENTS.md gives for never
 * writing an enumeration out twice.
 */

/** The first capture group of `re` against `text`, or `undefined` on no match. */
function firstCapture(re: RegExp, text: string): string | undefined {
  return re.exec(text)?.[1];
}

/**
 * The value of `field` in the `[tasks.<taskName>]` section of `source`.
 *
 * Handles the three literal forms this repo's mise.toml uses: a triple-quoted
 * multi-line body, and single- or double-quoted one-liners.
 *
 * @throws if the section or the field is absent — a fixture built from a
 * section that has moved should fail loudly rather than silently test nothing.
 */
export function extractTaskField(source: string, taskName: string, field: string): string {
  const escapedTask = taskName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const header = new RegExp(`^\\[tasks\\.${escapedTask}\\]\\s*$`, 'm').exec(source);
  if (!header) throw new Error(`no [tasks.${taskName}] section in source`);
  const rest = source.slice(header.index + header[0].length);
  const nextHeader = /^\[/m.exec(rest);
  const body = nextHeader ? rest.slice(0, nextHeader.index) : rest;

  const triple = firstCapture(new RegExp(`^${field}\\s*=\\s*'''\\n([\\s\\S]*?)\\n'''`, 'm'), body);
  if (triple !== undefined) return triple;

  const single = firstCapture(new RegExp(`^${field}\\s*=\\s*'([^']*)'`, 'm'), body);
  if (single !== undefined) return single;

  const double = firstCapture(new RegExp(`^${field}\\s*=\\s*"([^"]*)"`, 'm'), body);
  if (double !== undefined) return double;

  throw new Error(`no "${field}" field in [tasks.${taskName}]`);
}
