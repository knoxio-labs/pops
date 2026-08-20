/**
 * Reading the `accept` attribute's value as the one statement of what a file
 * picker takes.
 *
 * The drop zone's `accept` attribute and the validator that runs on drop are
 * two enforcement points for one rule, and a browser applies `accept` only to
 * the browse dialog — a dragged file reaches the validator regardless. Deriving
 * both from the same string is what stops them disagreeing, which would show a
 * picker that offers a file type the validator then rejects.
 */

/** Extensions named by an `accept` value, lower-cased and dot-prefixed. */
export function acceptedExtensions(accepted: string): string[] {
  return accepted
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.startsWith('.') && entry.length > 1);
}

/** Whether a file's name ends in one of the accepted extensions. */
export function hasAcceptedExtension(fileName: string, accepted: string): boolean {
  const lower = fileName.toLowerCase();
  return acceptedExtensions(accepted).some((extension) => lower.endsWith(extension));
}

/**
 * The accepted types as prose, for a label: `.csv` reads `CSV`, `.csv,.pdf`
 * reads `CSV or PDF`.
 */
export function describeAcceptedTypes(accepted: string): string {
  const names = acceptedExtensions(accepted).map((extension) =>
    extension.slice(1).toUpperCase()
  );
  if (names.length === 0) return 'file';
  if (names.length === 1) return names[0] ?? 'file';
  return `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`;
}
