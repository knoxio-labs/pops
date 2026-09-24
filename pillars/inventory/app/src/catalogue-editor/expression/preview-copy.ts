const UNAVAILABLE_COPY: Record<string, (field: string, item: string) => string> = {
  missing_dependency: (field, item) => `${field} is empty on ${item}.`,
  reference_deleted: (field, item) => `${field} on ${item} points at an item that was deleted.`,
  reference_missing: (field, item) =>
    `${field} on ${item} points at an item that no longer exists.`,
  reference_unresolved: (field, item) =>
    `${field} on ${item} points at an item that could not be read.`,
  evaluation_error: (field, item) => `${field} could not be calculated on ${item}.`,
};

/**
 * Names the input that stopped the calculation. Every reason names both the
 * field and the item it was read on, because "unavailable" alone gives the
 * author nothing to fix. A reason this client does not know yet still names
 * both, with the server's code.
 */
export function unavailableSentence(reason: string, field: string, item: string): string {
  const copy = UNAVAILABLE_COPY[reason];
  return copy === undefined ? `${field} on ${item} is unavailable (${reason}).` : copy(field, item);
}

const ERROR_COPY: Record<string, string> = {
  division_by_zero: 'It divides by zero.',
  integer_overflow: 'The whole number is too large to store.',
  precision_overflow: 'The decimal has more digits than can be stored.',
  invalid_value: 'An input has a value of the wrong shape.',
};

/** Plain-language reason a calculation failed on the chosen item, or the raw code. */
export function evaluationErrorSentence(code: string): string {
  return ERROR_COPY[code] ?? `The calculation failed (${code}).`;
}
