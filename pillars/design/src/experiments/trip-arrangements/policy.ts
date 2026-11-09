import { instant } from '../trip-route-editing/calendar-time';
import { localDateTime } from '../trip-route-editing/canvas-zoned-time';

import type { ArrangementPolicy } from './types';

/** Reports explicit invalid policy facts; missing optional prices and deadlines stay unknown. */
export function policyFindings(policy: ArrangementPolicy): { id: string; message: string }[] {
  const findings: { id: string; message: string }[] = [];
  if (
    policy.changeCost &&
    (!Number.isFinite(policy.changeCost.amount) ||
      policy.changeCost.amount < 0 ||
      !policy.changeCost.currency.trim())
  )
    findings.push({ id: 'change-cost', message: 'The source change cost or currency is invalid.' });
  if (policy.cancellation && !localDateTime(policy.cancellation.at, policy.cancellation.timeZone))
    findings.push({
      id: 'cancellation',
      message: 'The source cancellation time or zone is invalid.',
    });
  return findings;
}

/** Compares actual instants only; no urgency threshold or assumed clock is supplied. */
export function cancellationState(
  policy: ArrangementPolicy | undefined,
  referenceAt: string
): 'unknown' | 'invalid' | 'passed' | 'now' | 'upcoming' {
  if (!policy?.cancellation) return 'unknown';
  const deadline = instant(policy.cancellation.at);
  const reference = instant(referenceAt);
  if (
    !Number.isFinite(reference) ||
    !localDateTime(policy.cancellation.at, policy.cancellation.timeZone)
  )
    return 'invalid';
  if (deadline === reference) return 'now';
  return deadline < reference ? 'passed' : 'upcoming';
}
