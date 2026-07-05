import { Sparkles, Zap } from 'lucide-react';

import { Badge, Popover, PopoverContent, PopoverTrigger } from '@pops/ui';

import type { MatchedRule } from '@pops/finance';

import type { ProcessedTransaction } from '../../../store/import-store-types';

type EntityMatchType = NonNullable<ProcessedTransaction['entity']>['matchType'];

/**
 * Match types the system resolved deterministically — as opposed to `ai` (a
 * model guess, no guaranteed-correct trust signal), `manual`, an explicit/
 * `learned` rule, or `none`. Kept distinct from `ai` (CF037/#3655): an AI
 * match carries no deterministic guarantee and must not read as identical
 * trust to alias/exact/prefix/contains.
 */
const AUTO_MATCH_TYPES: readonly EntityMatchType[] = ['alias', 'exact', 'prefix', 'contains'];

/** Below this, the AI-matched badge calls out low confidence rather than just reporting a number. */
const LOW_AI_CONFIDENCE_THRESHOLD = 0.7;

function aiMatchedTitle(confidence: number | undefined): string {
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
      className="text-xs flex items-center gap-1"
      title={aiMatchedTitle(confidence)}
    >
      <Sparkles className="w-3 h-3" />
      AI-matched
      {confidence !== undefined && ` ${Math.round(confidence * 100)}%`}
    </Badge>
  );
}

function ruleMatchedTitle(ruleProvenance: ProcessedTransaction['ruleProvenance']): string {
  if (!ruleProvenance) return 'Rule matched';
  return [
    'Rule matched',
    `Pattern: ${ruleProvenance.pattern}`,
    `Match type: ${ruleProvenance.matchType}`,
    `Confidence: ${Math.round(ruleProvenance.confidence * 100)}%`,
  ].join('\n');
}

export function HeaderBadges({ transaction }: { transaction: ProcessedTransaction }) {
  const matchType = transaction.entity?.matchType;
  const isAutoMatched = matchType !== undefined && AUTO_MATCH_TYPES.includes(matchType);
  const isAiMatched = matchType === 'ai';
  const ruleProvenance = transaction.ruleProvenance;
  const isRuleMatched = Boolean(ruleProvenance) || matchType === 'learned';
  const overriddenRules = transaction.matchedRules?.slice(1) ?? [];
  return (
    <>
      {transaction.manuallyEdited && (
        <Badge variant="secondary" className="text-xs">
          Edited
        </Badge>
      )}
      {isAutoMatched && (
        <Badge variant="secondary" className="text-xs flex items-center gap-1">
          <Zap className="w-3 h-3" />
          Auto-matched
        </Badge>
      )}
      {isAiMatched && <AiMatchedBadge confidence={transaction.entity?.confidence} />}
      {isRuleMatched && (
        <Badge variant="secondary" className="text-xs" title={ruleMatchedTitle(ruleProvenance)}>
          Rule matched
        </Badge>
      )}
      {overriddenRules.length > 0 && <OverriddenRulesPopover rules={overriddenRules} />}
    </>
  );
}

function OverriddenRulesPopover({ rules }: { rules: MatchedRule[] }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Badge
          variant="outline"
          className="text-xs cursor-pointer hover:bg-accent"
          aria-label={`${rules.length} rule${rules.length === 1 ? '' : 's'} overridden`}
        >
          +{rules.length} overridden
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <p className="text-xs font-medium text-muted-foreground mb-2">
          Overridden rules (lower priority)
        </p>
        <ul className="space-y-2">
          {rules.map((rule) => (
            <li key={rule.ruleId} className="text-xs border rounded p-2 space-y-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <code className="font-mono truncate max-w-[18ch]" title={rule.pattern}>
                  {rule.pattern}
                </code>
                <Badge variant="outline" className="text-[10px] shrink-0">
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
