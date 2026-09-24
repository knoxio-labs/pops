import type { EvaluationErrorCode, PreviewMissingInput } from './scenario';

/** Names one missing input: the field and the item it was read on. */
function missingInputSentence(input: PreviewMissingInput): string {
  switch (input.reason) {
    case 'missing_dependency':
      return `${input.fieldLabel} is empty on ${input.itemLabel}`;
    case 'reference_deleted':
      return `${input.fieldLabel} on ${input.itemLabel} points at an item that was deleted`;
    case 'reference_missing':
      return `${input.fieldLabel} on ${input.itemLabel} points at an item that no longer exists`;
    case 'reference_unresolved':
      return `${input.fieldLabel} on ${input.itemLabel} points at an item that could not be read`;
  }
}

/**
 * Names every input that stopped the calculation, because "unavailable"
 * alone gives the author nothing to fix. `coalesce` can name several, one per
 * argument that had none.
 */
export function unavailableSentence(missingInputs: readonly PreviewMissingInput[]): string {
  if (missingInputs.length <= 1)
    return `${missingInputs.map(missingInputSentence).join('') || 'Nothing to read'}.`;
  return `${missingInputs.length} inputs are missing: ${missingInputs.map(missingInputSentence).join('; ')}.`;
}

const ERROR_COPY: Record<EvaluationErrorCode, string> = {
  division_by_zero: 'It divides by zero.',
  integer_overflow: 'The whole number is too large to store.',
  precision_overflow: 'The decimal has more digits than can be stored.',
  invalid_value: 'An input has a value of the wrong shape.',
};

/** Plain-language reason a calculation failed on the chosen item. */
export function evaluationErrorSentence(code: EvaluationErrorCode): string {
  return ERROR_COPY[code];
}
