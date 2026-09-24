/**
 * One input a preview's calculation could not read: the field, the item it
 * was read on, and why (the server's raw `reason` string, open per Inventory
 * ADR-002 D10 so a client without the newest copy still shows something
 * sensible). `coalesce` reports one per argument that had none, so an
 * unavailable result can name several.
 */
export interface PreviewMissingInput {
  readonly reason: string;
  readonly fieldLabel: string;
  readonly itemLabel: string;
}

const MISSING_INPUT_COPY: Record<string, (field: string, item: string) => string> = {
  missing_dependency: (field, item) => `${field} is empty on ${item}`,
  reference_deleted: (field, item) => `${field} on ${item} points at an item that was deleted`,
  reference_missing: (field, item) => `${field} on ${item} points at an item that no longer exists`,
  reference_unresolved: (field, item) =>
    `${field} on ${item} points at an item that could not be read`,
};

/** Names one missing input: the field and the item it was read on. */
function missingInputSentence(input: PreviewMissingInput): string {
  const copy = MISSING_INPUT_COPY[input.reason];
  return copy === undefined
    ? `${input.fieldLabel} on ${input.itemLabel} is unavailable (${input.reason})`
    : copy(input.fieldLabel, input.itemLabel);
}

/**
 * Names every input that stopped the calculation, because "unavailable"
 * alone gives the author nothing to fix. `coalesce` can leave several
 * arguments without a value, so this counts and lists every one of them.
 */
export function unavailableSentence(missingInputs: readonly PreviewMissingInput[]): string {
  if (missingInputs.length <= 1)
    return `${missingInputs.map(missingInputSentence).join('') || 'Nothing to read'}.`;
  return `${missingInputs.length} inputs are missing: ${missingInputs.map(missingInputSentence).join('; ')}.`;
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
