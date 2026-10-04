import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { Button } from '@pops/ui';

import { MatchRuleAttribution } from '../MatchRuleAttribution.js';
import { ManualLinkAction } from './ManualLinkAction.js';

import type { ReactElement } from 'react';

import type { DecisionKind, QueueEntry } from './types.js';
import type { DecisionOutcome } from './useReconcileDecisions.js';

interface DecisionBarProps {
  activeEntry: QueueEntry | undefined;
  isPending: boolean;
  lastOutcome: DecisionOutcome | null;
  onDecide: (entry: QueueEntry, kind: DecisionKind) => void;
  onLinked: (entry: QueueEntry) => void;
}

/**
 * The mouse path, and the place the keyboard contract is written down.
 *
 * The buttons act on the row under the cursor rather than living inside it:
 * a `role="option"` may not contain interactive children, and a per-row button
 * would be a tab stop per row in a list that can run to hundreds. The link to
 * the order behind the cursor is here for exactly the same reason — the row is
 * where a reader would reach for it, and the row is the one place it cannot go.
 */
export function DecisionBar({
  activeEntry,
  isPending,
  lastOutcome,
  onDecide,
  onLinked,
}: DecisionBarProps): ReactElement {
  const { t } = useTranslation('purchases');
  const learnedRules = activeRules(activeEntry);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <DecisionActions
          activeEntry={activeEntry}
          isPending={isPending}
          onDecide={onDecide}
          onLinked={onLinked}
        />
        <p className="text-muted-foreground text-xs">{t('reconcile.keys.hint')}</p>
      </div>

      {learnedRules.length > 0 && (
        <ul className="space-y-2" aria-label={t('reconcile.rule.listLabel')}>
          {learnedRules.map((rule) => (
            <li key={rule.id}>
              <MatchRuleAttribution {...rule} />
            </li>
          ))}
        </ul>
      )}

      <p role="status" aria-live="polite" className="text-sm">
        {outcomeMessage(lastOutcome, t)}
      </p>

      <p className="text-muted-foreground text-xs">{t('reconcile.action.caveat')}</p>
    </div>
  );
}

interface DecisionActionsProps {
  activeEntry: QueueEntry | undefined;
  isPending: boolean;
  onDecide: (entry: QueueEntry, kind: DecisionKind) => void;
  onLinked: (entry: QueueEntry) => void;
}

function DecisionActions({
  activeEntry,
  isPending,
  onDecide,
  onLinked,
}: DecisionActionsProps): ReactElement {
  const { t } = useTranslation('purchases');
  const disabled = isPending || activeEntry === undefined || activeEntry.proposed.length === 0;

  return (
    <>
      <Button
        size="sm"
        disabled={disabled}
        onClick={() => activeEntry !== undefined && onDecide(activeEntry, 'accept')}
      >
        {t('reconcile.action.accept')}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => activeEntry !== undefined && onDecide(activeEntry, 'reject')}
      >
        {t('reconcile.action.reject')}
      </Button>
      {activeEntry !== undefined && activeEntry.proposed.length === 0 && (
        <ManualLinkAction
          key={activeEntry.chargeId}
          entry={activeEntry}
          disabled={isPending}
          onLinked={onLinked}
        />
      )}
      {activeEntry !== undefined && (
        <Link
          to={`/purchases/${activeEntry.purchaseId}`}
          className="text-sm underline underline-offset-4"
        >
          {t('reconcile.action.openOrder')}
        </Link>
      )}
    </>
  );
}

function activeRules(entry: QueueEntry | undefined): Array<{
  id: string;
  pattern: string;
  source: string | null;
  isActive: boolean;
}> {
  if (entry === undefined) return [];
  const rules = new Map<
    string,
    { id: string; pattern: string; source: string | null; isActive: boolean }
  >();
  for (const link of entry.proposed) {
    if (
      link.linkType !== 'rule' ||
      link.matchRuleId === null ||
      link.matchRulePattern === null ||
      link.matchRuleIsActive === null
    ) {
      continue;
    }
    rules.set(link.matchRuleId, {
      id: link.matchRuleId,
      pattern: link.matchRulePattern,
      source: link.matchRuleSource,
      isActive: link.matchRuleIsActive,
    });
  }
  return [...rules.values()];
}

type Translate = ReturnType<typeof useTranslation<'purchases'>>['t'];

function outcomeMessage(outcome: DecisionOutcome | null, t: Translate): string {
  if (outcome === null) return '';
  if (outcome.status === 'error') {
    return t('reconcile.status.failed', { message: outcome.message ?? '' });
  }
  return outcome.kind === 'accept'
    ? t('reconcile.status.accepted')
    : t('reconcile.status.rejected');
}
