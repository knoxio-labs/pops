import { useTranslation } from 'react-i18next';

import { Button, formatCents, formatDate } from '@pops/ui';

import type { ReactElement } from 'react';

import type { ManualCandidateOption } from './manual-link-options.js';

interface ManualCandidateResultProps {
  candidate: ManualCandidateOption;
  disabled: boolean;
  fallbackCurrency: string;
  onSelect: () => void;
}

/** Displays one retained or searched transaction in the manual-link picker. */
export function ManualCandidateResult({
  candidate,
  disabled,
  fallbackCurrency,
  onSelect,
}: ManualCandidateResultProps): ReactElement {
  const { t } = useTranslation('purchases');

  return (
    <Button
      type="button"
      variant="ghost"
      size="lg"
      disabled={disabled}
      className="h-auto min-h-11 w-full justify-start whitespace-normal py-2 text-left"
      onClick={onSelect}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {candidate.description ?? t('reconcile.entry.transactionDescriptionUnavailable')}
        </span>
        <span className="text-muted-foreground block text-xs">
          {candidate.date === null
            ? t('reconcile.entry.transactionDateUnavailable')
            : formatDate(candidate.date)}
          {candidate.payee === null ? '' : ` · ${candidate.payee}`}
          {' · '}
          {candidate.amountCents === null
            ? t('reconcile.entry.transactionAmountUnavailable')
            : formatCents(candidate.amountCents, candidate.settlementCurrency ?? fallbackCurrency)}
        </span>
      </span>
    </Button>
  );
}
