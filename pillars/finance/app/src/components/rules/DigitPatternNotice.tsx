/**
 * Notice shown next to a regex rule's pattern input explaining that digits are
 * stripped from descriptions before matching, so a digit-dependent pattern
 * (`\d{4}`, `4471`, `[0-9]`) can never fire (POPS-2622).
 *
 * Rendered only for `matchType: 'regex'` — `exact`/`contains` patterns are
 * normalised the same way the description is, so their digits disappear on
 * both sides and matching still lines up.
 */
import { AlertTriangle } from 'lucide-react';

import { regexPatternExpectsDigits, type PatternMatchType } from '@pops/finance';

export const DIGIT_PATTERN_NOTICE =
  'Digits are removed from descriptions before matching, so any part of this pattern that expects a digit will never match.';

export function shouldWarnAboutDigits(pattern: string, matchType: PatternMatchType): boolean {
  return matchType === 'regex' && regexPatternExpectsDigits(pattern);
}

export function DigitPatternNotice({
  pattern,
  matchType,
}: {
  pattern: string;
  matchType: PatternMatchType;
}) {
  if (!shouldWarnAboutDigits(pattern, matchType)) return null;
  return (
    <p className="flex items-start gap-1.5 text-warning text-xs" data-testid="digit-pattern-notice">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden="true" />
      <span>{DIGIT_PATTERN_NOTICE}</span>
    </p>
  );
}
