import type { CommitResult } from '@pops/finance';

type WriteCounts = CommitResult['tagRuleWrites'];

/**
 * An `add` that lands on a rule the batch did not create merges into it
 * rather than creating anything. Naming that separately is the whole point of
 * POPS-2755 and POPS-2954: "20 added" hid the fact that some of the 20 were
 * somebody else's curated rules being amended.
 *
 * Rendered only when something was in fact merged — an import where every add
 * created a rule has nothing to disambiguate, and a footnote saying so would
 * be noise on the common path.
 */
function RuleWriteBreakdown({ writes, noun }: { writes: WriteCounts; noun: string }) {
  if (!writes || writes.reinforced === 0) return null;
  return (
    <p className="text-xs text-muted-foreground mt-2">
      {writes.inserted} {noun} {writes.inserted === 1 ? 'rule' : 'rules'} created,{' '}
      {writes.reinforced} merged into {writes.reinforced === 1 ? 'a rule' : 'rules'} that already
      existed.
    </p>
  );
}

export function RuleBreakdown({
  rulesApplied,
  tagRuleWrites,
  correctionRuleWrites,
  totalRules,
}: {
  rulesApplied: CommitResult['rulesApplied'];
  tagRuleWrites: CommitResult['tagRuleWrites'];
  correctionRuleWrites: CommitResult['correctionRuleWrites'];
  totalRules: number;
}) {
  if (totalRules === 0) return null;
  const items: Array<[number, string]> = [
    [rulesApplied.add, 'Added'],
    [rulesApplied.edit, 'Edited'],
    [rulesApplied.disable, 'Disabled'],
    [rulesApplied.remove, 'Removed'],
  ];
  return (
    <div className="border rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-2">Rule Breakdown</h3>
      <div className="grid grid-cols-4 gap-2 text-sm text-center">
        {items.map(([count, label]) =>
          count > 0 ? (
            <div key={label}>
              <div className="font-medium">{count}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          ) : null
        )}
      </div>
      <RuleWriteBreakdown writes={correctionRuleWrites} noun="correction" />
      <RuleWriteBreakdown writes={tagRuleWrites} noun="tag" />
    </div>
  );
}
