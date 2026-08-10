/**
 * Argument reading shared by the command-line guards and tools under
 * `scripts/`.
 */

/**
 * The value following `flag`, or `undefined` when the flag is absent or was
 * given nothing to take.
 *
 * A following token that is itself a flag is not a value: `--issues --json`
 * would otherwise read `--json` as the path and die on ENOENT several steps
 * later, instead of saying which argument was missing.
 *
 * @param {string[]} args
 * @param {string} flag
 * @returns {string | undefined}
 */
export function readFlag(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith('-')) return undefined;
  return value;
}
