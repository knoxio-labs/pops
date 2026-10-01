import { Badge, Popover, PopoverContent, PopoverTrigger } from '@pops/ui';

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

function ExplainedBadge({
  label,
  explanation,
  className,
}: {
  label: string;
  explanation: string;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label}. ${explanation}`}
          className="relative inline-flex cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring before:absolute before:-inset-3 before:content-['']"
        >
          <Badge variant="outline" className={className} title={explanation}>
            {label}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <p className="text-xs">{explanation}</p>
      </PopoverContent>
    </Popover>
  );
}

function OverlapBadges({ overlaps }: { overlaps: readonly TagRuleOverlap[] }) {
  const contradicts = overlaps.filter((overlap) => overlap.kind === 'contradicts');
  const redundant = overlaps.filter((overlap) => overlap.kind === 'redundant');
  return (
    <>
      {contradicts.length > 0 && (
        <ExplainedBadge
          label={`Contradicts ${named(contradicts)}`}
          explanation={`Matches the same transactions as ${quoted(contradicts)} and writes a different value on the same single-valued axis, so one of them silently loses`}
          className="border-destructive text-destructive"
        />
      )}
      {redundant.length > 0 && (
        <ExplainedBadge
          label={`Redundant with ${named(redundant)}`}
          explanation={`Every transaction this matches is already given the same tags by ${quoted(redundant)}`}
          className="text-muted-foreground"
        />
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
        <ExplainedBadge
          label="Never matches"
          explanation="This pattern matches no transaction in the ledger — it can never fire"
          className="border-destructive text-destructive"
        />
      )}
      <OverlapBadges overlaps={rule.overlaps} />
    </div>
  );
}
