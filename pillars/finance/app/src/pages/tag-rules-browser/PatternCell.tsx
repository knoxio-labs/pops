import { Badge } from '@pops/ui';

import type { TagRule, TagRuleOverlap } from './types';

function quoted(overlaps: readonly TagRuleOverlap[]): string {
  return overlaps.map((overlap) => `“${overlap.descriptionPattern}”`).join(', ');
}

function named(overlaps: readonly TagRuleOverlap[]): string {
  const [only] = overlaps;
  return overlaps.length === 1 && only
    ? `“${only.descriptionPattern}”`
    : `${overlaps.length} rules`;
}

function OverlapBadges({ overlaps }: { overlaps: readonly TagRuleOverlap[] }) {
  const contradicts = overlaps.filter((overlap) => overlap.kind === 'contradicts');
  const redundant = overlaps.filter((overlap) => overlap.kind === 'redundant');
  return (
    <>
      {contradicts.length > 0 && (
        <Badge
          variant="outline"
          className="border-destructive text-destructive"
          title={`Matches the same transactions as ${quoted(contradicts)} and writes a different value on the same single-valued axis, so one of them silently loses`}
        >
          Contradicts {named(contradicts)}
        </Badge>
      )}
      {redundant.length > 0 && (
        <Badge
          variant="outline"
          className="text-muted-foreground"
          title={`Every transaction this matches is already given the same tags by ${quoted(redundant)}`}
        >
          Redundant with {named(redundant)}
        </Badge>
      )}
    </>
  );
}

/**
 * A rule's pattern with what the ledger says about it: that it never matches
 * (POPS-2941), or that it contradicts or duplicates another rule (POPS-3691).
 */
export function PatternCell({ rule }: { rule: TagRule }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-sm">{rule.descriptionPattern}</span>
      {rule.ledgerMatchStatus === 'broken' && (
        <Badge
          variant="outline"
          className="border-destructive text-destructive"
          title="This pattern matches no transaction in the ledger — it can never fire"
        >
          Never matches
        </Badge>
      )}
      <OverlapBadges overlaps={rule.overlaps} />
    </div>
  );
}
