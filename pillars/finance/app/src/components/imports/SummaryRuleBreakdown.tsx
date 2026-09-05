import type { CommitResult } from '@pops/finance';

/**
 * A tag-rule `add` that lands on a rule the batch did not create merges into
 * it rather than creating anything. Naming that separately is the whole point
 * of POPS-2755: "20 added" hid the fact that some of the 20 were somebody
 * else's curated rules being amended.
 */
function TagRuleWriteBreakdown({ writes }: { writes: CommitResult['tagRuleWrites'] }) {
  if (!writes || writes.reinforced === 0) return null;
  return (
    <p className="text-xs text-muted-foreground mt-2">
      {writes.inserted} tag {writes.inserted === 1 ? 'rule' : 'rules'} created, {writes.reinforced}{' '}
      merged into {writes.reinforced === 1 ? 'a rule' : 'rules'} that already existed.
    </p>
  );
}

export function RuleBreakdown({
  rulesApplied,
  tagRuleWrites,
  totalRules,
}: {
  rulesApplied: CommitResult['rulesApplied'];
  tagRuleWrites: CommitResult['tagRuleWrites'];
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
      <TagRuleWriteBreakdown writes={tagRuleWrites} />
    </div>
  );
}
