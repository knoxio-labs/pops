import { Badge, formatCurrency, formatDate } from '@pops/ui';

import { isUnavailableError } from '../../../../finance-api-helpers.js';
import { useRuleMatchPreview, type RuleMatchPreviewRow } from './useRuleMatchPreview';

import type { CorrectionRule } from '../../RulePicker';

function money(amount: number): string {
  return formatCurrency(amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function CurrentEntity({ entityName }: { entityName: string | null }) {
  if (entityName) return <span className="truncate">{entityName}</span>;
  return <span className="italic text-muted-foreground/70">no entity</span>;
}

function MatchRow({ row, rule }: { row: RuleMatchPreviewRow; rule: CorrectionRule }) {
  const wouldChange = (row.entityId ?? null) !== (rule.entityId ?? null);
  return (
    <div
      className="text-xs rounded border-l-2 border-muted pl-2 py-0.5"
      data-testid="rule-match-row"
    >
      <div className="font-mono truncate" title={row.description}>
        {row.description}
      </div>
      <div className="text-2xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span>{formatDate(row.date)}</span>
        <span>{money(row.amount)}</span>
        <CurrentEntity entityName={row.entityName} />
        <Badge
          variant={wouldChange ? 'default' : 'secondary'}
          className="text-2xs px-1 py-0 leading-tight normal-case"
        >
          {wouldChange ? 'entity changes' : 'entity matches'}
        </Badge>
      </div>
    </div>
  );
}

function ListHeader({ shown, total }: { shown: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
      <span>Matches across your library</span>
      <span className="tabular-nums text-foreground" data-testid="rule-match-total">
        {total}
      </span>
      {total > shown && (
        <span className="normal-case font-normal" data-testid="rule-match-truncated">
          (showing first {shown} of {total})
        </span>
      )}
    </div>
  );
}

/**
 * Lists the transactions the selected rule matches across the whole finance DB
 * — the true match set, not the truncated changeset-preview sample — so a
 * too-broad or malformed pattern is obvious from what it visibly hits.
 */
export function RuleMatchList({ rule }: { rule: CorrectionRule }) {
  const query = useRuleMatchPreview({
    pattern: rule.descriptionPattern,
    matchType: rule.matchType,
  });

  if (query.isPending) {
    return (
      <div className="text-xs text-muted-foreground" data-testid="rule-match-loading">
        Scanning your library…
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="text-xs text-destructive" data-testid="rule-match-error">
        {isUnavailableError(query.error)
          ? 'Finance service unavailable — cannot list matches.'
          : 'Could not load matched transactions.'}
      </div>
    );
  }

  const { matches, totalCount } = query.data;
  if (totalCount === 0) {
    return (
      <div className="text-xs text-muted-foreground" data-testid="rule-match-empty">
        No transactions in your library match this rule.
      </div>
    );
  }

  return (
    <section className="space-y-1.5" data-testid="rule-match-list">
      <ListHeader shown={matches.length} total={totalCount} />
      <div className="space-y-1 max-h-64 overflow-auto pr-1">
        {matches.map((row) => (
          <MatchRow key={row.id} row={row} rule={rule} />
        ))}
      </div>
    </section>
  );
}
