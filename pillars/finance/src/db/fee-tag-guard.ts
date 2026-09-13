/**
 * The refusal a direct transaction write raises when it would store a `fee:`
 * tag on a row whose `type` is not `fee` (POPS-2610 made the namespace a fee's
 * sub-kind, so the pair is a contradiction). Automatic bulk writes drop the
 * value instead, through `withoutFeeTagsOnNonFeeType`.
 */
import { feeTagsOnNonFeeType } from '../contract/transaction-classification.js';

/** A write that would leave `fee:` values on a row not typed `fee`. */
export class FeeTagOnNonFeeTypeError extends Error {
  override readonly name = 'FeeTagOnNonFeeTypeError' as const;
  readonly type: string;
  /** The contradicting `fee:` values, verbatim. */
  readonly tags: readonly string[];

  constructor(type: string, tags: readonly string[]) {
    super(
      `A '${type}' transaction cannot carry fee tags (${tags.join(', ')}): ` +
        `the fee: namespace is only for type 'fee'. Remove them or change the type to 'fee'`
    );
    this.type = type;
    this.tags = tags;
  }
}

/** Throw {@link FeeTagOnNonFeeTypeError} when `tags` carries a `fee:` value `type` contradicts. */
export function assertNoFeeTagsOnNonFeeType(type: string, tags: readonly string[]): void {
  const contradicting = feeTagsOnNonFeeType(type, tags);
  if (contradicting.length > 0) throw new FeeTagOnNonFeeTypeError(type, contradicting);
}
