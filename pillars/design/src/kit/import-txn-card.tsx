import { ArrowLeftRight, Sparkles, Zap } from 'lucide-react';

import { Badge, EmptyStateTab, Popover, PopoverContent, PopoverTrigger } from '@pops/ui';

import type { EntityMatchType, ImportTxn, OverriddenRule } from '@/fixtures/import-transactions';

/** Match types the ladder resolved deterministically, as opposed to an AI guess or a rule. */
const AUTO_MATCH_TYPES: readonly EntityMatchType[] = ['alias', 'exact', 'prefix', 'contains'];

/** Below this, the AI-matched badge calls out low confidence rather than just reporting a number. */
export const LOW_AI_CONFIDENCE_THRESHOLD = 0.7;

/** Whether a match type was resolved deterministically, without an AI guess or a learned rule. */
export function isAutoMatchedType(matchType: EntityMatchType | undefined): boolean {
  return matchType !== undefined && AUTO_MATCH_TYPES.includes(matchType);
}

export function aiMatchedTitle(confidence: number | undefined): string {
  if (confidence === undefined) return 'Entity resolved by AI (no reported confidence)';
  const pct = Math.round(confidence * 100);
  return confidence < LOW_AI_CONFIDENCE_THRESHOLD
    ? `Entity resolved by AI — low confidence (${pct}%), review before trusting`
    : `Entity resolved by AI — confidence ${pct}%`;
}

function AiMatchedBadge({ confidence }: { confidence: number | undefined }) {
  const isLowConfidence = confidence !== undefined && confidence < LOW_AI_CONFIDENCE_THRESHOLD;
  return (
    <Badge
      variant={isLowConfidence ? 'destructive' : 'outline'}
      className="flex items-center gap-1 text-xs"
      title={aiMatchedTitle(confidence)}
    >
      <Sparkles className="h-3 w-3" aria-hidden />
      AI-matched
      {confidence !== undefined && ` ${Math.round(confidence * 100)}%`}
    </Badge>
  );
}

export function ruleMatchedTitle(ruleProvenance: ImportTxn['ruleProvenance']): string {
  if (!ruleProvenance) return 'Rule matched';
  return [
    'Rule matched',
    `Pattern: ${ruleProvenance.pattern}`,
    `Match type: ${ruleProvenance.matchType}`,
    `Confidence: ${Math.round(ruleProvenance.confidence * 100)}%`,
  ].join('\n');
}

function TransactionTypeBadge({ txn }: { txn: ImportTxn }) {
  if (txn.transactionType === undefined) {
    return (
      <Badge
        variant="outline"
        className="text-xs text-muted-foreground"
        title="No transaction type assigned yet"
      >
        Untyped
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs" title={`Transaction type: ${txn.transactionType}`}>
      {txn.transactionType === 'transfer' && <ArrowLeftRight className="h-3 w-3" aria-hidden />}
      {txn.transactionType}
    </Badge>
  );
}

function OverriddenRulesPopover({ rules }: { rules: OverriddenRule[] }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Badge
          variant="outline"
          className="cursor-pointer text-xs hover:bg-accent"
          aria-label={`${rules.length} rule${rules.length === 1 ? '' : 's'} overridden`}
        >
          +{rules.length} overridden
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Overridden rules (lower priority)
        </p>
        <ul className="space-y-2">
          {rules.map((rule) => (
            <li key={rule.ruleId} className="space-y-0.5 rounded border p-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <code className="max-w-[18ch] truncate font-mono" title={rule.pattern}>
                  {rule.pattern}
                </code>
                <Badge variant="outline" className="shrink-0 text-2xs">
                  {rule.matchType}
                </Badge>
              </div>
              <div className="text-muted-foreground">
                Priority: {rule.priority} • {Math.round(rule.confidence * 100)}%
                {rule.entityName && ` • ${rule.entityName}`}
              </div>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Provenance badges for one transaction — untyped/edited/auto-matched/
 * AI-matched (with a low-confidence variant)/rule-matched/overridden-rules,
 * ported from `pillars/finance/app/src/components/imports/transaction-card/badges.tsx`.
 */
function TxnBadges({ txn }: { txn: ImportTxn }) {
  const matchType = txn.entity?.matchType;
  const isAutoMatched = isAutoMatchedType(matchType);
  const isAiMatched = matchType === 'ai';
  const isRuleMatched = Boolean(txn.ruleProvenance) || matchType === 'learned';
  const overriddenRules = txn.overriddenRules ?? [];
  return (
    <>
      <TransactionTypeBadge txn={txn} />
      {txn.manuallyEdited && (
        <Badge variant="secondary" className="text-xs">
          Edited
        </Badge>
      )}
      {isAutoMatched && (
        <Badge variant="secondary" className="flex items-center gap-1 text-xs">
          <Zap className="h-3 w-3" aria-hidden />
          Auto-matched
        </Badge>
      )}
      {isAiMatched && <AiMatchedBadge confidence={txn.entity?.confidence} />}
      {isRuleMatched && (
        <Badge variant="secondary" className="text-xs" title={ruleMatchedTitle(txn.ruleProvenance)}>
          Rule matched
        </Badge>
      )}
      {overriddenRules.length > 0 && <OverriddenRulesPopover rules={overriddenRules} />}
    </>
  );
}

function bucketBorder(bucket: ImportTxn['bucket']): string {
  if (bucket === 'uncertain') return 'border-warning/20 bg-warning/5';
  if (bucket === 'failed') return 'border-destructive/20 bg-destructive/5';
  return 'border-border bg-card';
}

/**
 * One transaction card, ported from
 * `pillars/finance/app/src/components/imports/transaction-card/CardChrome.tsx`
 * with the edit affordance, entity picker and raw-data collapsible left out —
 * this surface is a static render, not an editor.
 */
export function TxnCard({ txn }: { txn: ImportTxn }) {
  return (
    <div className={`rounded-lg border p-4 ${bucketBorder(txn.bucket)}`}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="font-medium">{txn.description || '(no description)'}</span>
        <TxnBadges txn={txn} />
      </div>
      <div className="text-sm text-muted-foreground">
        {txn.date} • ${Math.abs(txn.amount).toFixed(2)}
      </div>
      {txn.ruleProvenance && (
        <div className="mt-1 text-xs text-muted-foreground">
          <span className="font-mono">
            {txn.ruleProvenance.matchType} • {Math.round(txn.ruleProvenance.confidence * 100)}%
          </span>
          {' • '}
          <span
            className="inline-block max-w-[28ch] truncate align-bottom font-mono"
            title={txn.ruleProvenance.pattern}
          >
            {txn.ruleProvenance.pattern}
          </span>
        </div>
      )}
      {(txn.bucket === 'uncertain' || txn.bucket === 'failed') && txn.reason && (
        <p className="mt-2 text-xs text-muted-foreground">{txn.reason}</p>
      )}
    </div>
  );
}

export function TxnCardList({ txns, emptyMessage }: { txns: ImportTxn[]; emptyMessage: string }) {
  if (txns.length === 0) return <EmptyStateTab message={emptyMessage} />;
  return (
    <div className="space-y-3">
      {txns.map((txn) => (
        <TxnCard key={txn.checksum} txn={txn} />
      ))}
    </div>
  );
}
