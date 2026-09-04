import { Badge } from '@pops/ui';

import type { RuleProposalFixture } from '@/fixtures/import-transactions';

export type RulesApplied = { add: number; edit: number; disable: number; remove: number };
export type TxnBreakdown = { imported: number; duplicates: number; dropped: number };

export interface PendingSummary {
  entities: string[];
  rulesApplied: RulesApplied;
  tagRules: RuleProposalFixture[];
  txnBreakdown: TxnBreakdown;
  tagAssignment: { tagged: number; total: number };
}

export const totalOpsOf = (r: RulesApplied) => r.add + r.edit + r.disable + r.remove;
export const totalTxnsOf = (b: TxnBreakdown) => b.imported + b.duplicates + b.dropped;
export const isEmptySummary = (s: PendingSummary) =>
  s.entities.length === 0 &&
  totalOpsOf(s.rulesApplied) === 0 &&
  s.tagRules.length === 0 &&
  totalTxnsOf(s.txnBreakdown) === 0 &&
  s.tagAssignment.tagged === 0;

type SectionProps = { title: string; count: number; children: React.ReactNode };

const Section = ({ title, count, children }: SectionProps) =>
  count === 0 ? null : (
    <div className="rounded-lg border border-border">
      <div className="px-4 py-3 font-medium">
        {title} <span className="font-normal text-muted-foreground">({count})</span>
      </div>
      <div className="border-t border-border px-4 py-3">{children}</div>
    </div>
  );

export const EntitiesSection = ({ entities }: { entities: string[] }) => (
  <Section title="New Entities" count={entities.length}>
    <div className="flex flex-wrap gap-2">
      {entities.map((name) => (
        <Badge key={name} variant="secondary">
          {name}
        </Badge>
      ))}
    </div>
  </Section>
);

export const ClassificationRulesSection = ({ rulesApplied: r }: { rulesApplied: RulesApplied }) => (
  <Section title="Classification Rule Changes" count={totalOpsOf(r)}>
    <p className="text-sm text-muted-foreground">
      {r.add} to add, {r.edit} to edit, {r.disable} to disable, {r.remove} to remove.
    </p>
  </Section>
);

export const TagRulesSection = ({ proposals }: { proposals: RuleProposalFixture[] }) => (
  <Section title="Tag Rule Changes" count={proposals.length}>
    <ul className="space-y-1">
      {proposals.map((p) => (
        <li key={p.id} className="text-sm">
          <span className="font-mono text-xs text-muted-foreground">{p.pattern}</span> →{' '}
          {p.tags.join(', ')}
        </li>
      ))}
    </ul>
  </Section>
);

/**
 * The transaction-count summary, plus — when any were skipped as duplicates —
 * a note naming the account those duplicates were matched against (POPS-2820):
 * dedup is scoped to the picked account, never the whole ledger.
 */
export const TransactionsSection = ({
  breakdown: b,
  accountName,
}: {
  breakdown: TxnBreakdown;
  accountName: string;
}) => (
  <Section title="Transactions to Import" count={totalTxnsOf(b)}>
    <p className="text-sm text-muted-foreground">
      {b.imported} imported, {b.duplicates} skipped as duplicates, {b.dropped} dropped as untyped.
    </p>
    {b.duplicates > 0 && (
      <p className="mt-2 text-xs text-muted-foreground">
        Skipped as duplicates of a transaction already on {accountName} — matched against this
        account only, not the rest of your ledger.
      </p>
    )}
  </Section>
);

export const TagAssignmentsSection = ({ tagged, total }: { tagged: number; total: number }) => (
  <Section title="Tag Assignments" count={tagged}>
    <p className="text-sm text-muted-foreground">
      {tagged} tag{tagged === 1 ? '' : 's'} will be applied across {total} transaction
      {total === 1 ? '' : 's'}.
    </p>
  </Section>
);
