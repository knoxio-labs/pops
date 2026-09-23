import type { EvaluationErrorCode, UnavailableReason } from './scenario';

/**
 * Names the input that stopped the calculation. Every reason names both the
 * field and the item it was read on, because "unavailable" alone gives the
 * author nothing to fix.
 */
export function unavailableSentence(
  reason: Exclude<UnavailableReason, 'evaluation_error'>,
  field: string,
  item: string
): string {
  switch (reason) {
    case 'missing_dependency':
      return `${field} is empty on ${item}.`;
    case 'reference_deleted':
      return `${field} on ${item} points at an item that was deleted.`;
    case 'reference_missing':
      return `${field} on ${item} points at an item that no longer exists.`;
    case 'reference_unresolved':
      return `${field} on ${item} points at an item that could not be read.`;
  }
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
