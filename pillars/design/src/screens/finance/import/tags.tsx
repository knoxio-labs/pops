import {
  confirmedTxns,
  tagGroupsFrom,
  type ConfirmedTxn,
  type EntityTagGroup,
  type TagSuggestion,
} from '@/fixtures/import-transactions';
import { BookmarkPlus, ChevronDown, ClipboardList, Sparkles, Store } from 'lucide-react';

import {
  Badge,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  PageHeader,
} from '@pops/ui';

import { choiceOf } from './context';
import { ImportContextStrip } from './upload';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Tags', order: 6, frame: 'web' };

const AMEX = choiceOf('a2', 'amex-csv');

const SOURCE_META: Record<TagSuggestion['source'], { icon: typeof Sparkles; label: string }> = {
  ai: { icon: Sparkles, label: 'AI' },
  rule: { icon: ClipboardList, label: 'Rule' },
  entity: { icon: Store, label: 'Entity' },
};

function hasMissingSuggestion(row: ConfirmedTxn): boolean {
  return row.suggestedTags.some((s) => !row.tags.includes(s.tag));
}

function unionOf(rows: ConfirmedTxn[], pick: (row: ConfirmedTxn) => string[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) for (const tag of pick(row)) seen.add(tag);
  return [...seen];
}

function SourceBadge({ source }: { source: TagSuggestion['source'] }) {
  const { icon: Icon, label } = SOURCE_META[source];
  return (
    <Badge variant="outline" className="gap-1">
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </Badge>
  );
}

function TagRow({ row }: { row: ConfirmedTxn }) {
  const isNegative = row.amount < 0;
  const missing = row.suggestedTags.filter((s) => !row.tags.includes(s.tag));
  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{row.description}</p>
        <p className="text-xs text-muted-foreground">{row.date}</p>
      </div>
      <span
        className={`shrink-0 font-mono text-sm tabular-nums ${isNegative ? 'text-destructive' : 'text-success'}`}
      >
        {isNegative ? '-' : '+'}${Math.abs(row.amount).toFixed(2)}
      </span>
      <div className="flex w-64 shrink-0 flex-wrap items-center justify-end gap-1">
        {row.tags.map((tag) => (
          <Badge key={tag} variant="secondary">
            {tag}
          </Badge>
        ))}
        {missing.map((suggestion) => (
          <span key={suggestion.tag} className="flex items-center gap-1">
            <Badge variant="outline">{suggestion.tag}</Badge>
            <SourceBadge source={suggestion.source} />
          </span>
        ))}
        {row.tags.length === 0 && missing.length === 0 && (
          <span className="text-xs text-muted-foreground">No tags</span>
        )}
      </div>
    </div>
  );
}

function EntityGroupCard({ group }: { group: EntityTagGroup }) {
  const currentUnion = unionOf(group.transactions, (row) => row.tags);
  const hasSuggestions = group.transactions.some((row) => row.suggestedTags.length > 0);
  return (
    <Collapsible defaultOpen className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between gap-3 bg-muted/40 px-4 py-3">
        <CollapsibleTrigger className="flex flex-1 items-center gap-2 text-left">
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="text-sm font-medium">{group.entityName}</span>
          <span className="text-xs text-muted-foreground">({group.transactions.length})</span>
        </CollapsibleTrigger>
        <div className="flex shrink-0 items-center gap-2">
          {currentUnion.length > 0 && (
            <div className="hidden max-w-48 flex-wrap gap-1 sm:flex">
              {currentUnion.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
          {hasSuggestions && (
            <Button variant="outline" size="sm">
              Apply suggestions
            </Button>
          )}
          <Button variant="ghost" size="sm">
            <BookmarkPlus className="mr-1 h-3.5 w-3.5" aria-hidden />
            Save tag rule…
          </Button>
        </div>
      </div>
      <CollapsibleContent>
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/10 px-4 py-2 text-xs">
          <span className="text-muted-foreground">Apply to group:</span>
          <span className="text-muted-foreground">no tags staged</span>
        </div>
        <div className="divide-y divide-border">
          {group.transactions.map((row) => (
            <TagRow key={row.checksum} row={row} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function Step({ groups }: { groups: EntityTagGroup[] }) {
  const rows = groups.flatMap((g) => g.transactions);
  const unapplied = rows.filter(hasMissingSuggestion).length;
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <ImportContextStrip choice={AMEX} />
      <PageHeader
        title="Tags"
        description="Review and adjust tags. Nothing is written to the database until you approve on Final Review. Tags are pre-filled from AI suggestions, learned rules, and entity defaults."
      />
      {rows.length > 0 && (
        <Button variant="outline" size="sm" disabled={unapplied === 0}>
          Accept All Suggestions
        </Button>
      )}
      <div className="space-y-4">
        {groups.map((group) => (
          <EntityGroupCard key={group.entityName} group={group} />
        ))}
        {rows.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No transactions to import.
          </p>
        )}
      </div>
      <div className="flex items-center justify-between pt-2">
        <Button variant="outline">Back</Button>
        <Button disabled={rows.length === 0}>
          {rows.length === 0
            ? 'Continue to final review'
            : `Continue to final review (${rows.length})`}
        </Button>
      </div>
    </div>
  );
}

export default function ImportTagsStep() {
  return <Step groups={tagGroupsFrom(confirmedTxns)} />;
}

export const states: ScreenStates = {
  'no-suggestions': () => {
    const rows: ConfirmedTxn[] = confirmedTxns.map((row) => ({ ...row, suggestedTags: [] }));
    return <Step groups={tagGroupsFrom(rows)} />;
  },
  'all-tagged': () => {
    const rows: ConfirmedTxn[] = confirmedTxns.map((row) => ({
      ...row,
      tags: row.suggestedTags.map((s) => s.tag),
    }));
    return <Step groups={tagGroupsFrom(rows)} />;
  },
  'no-entity-group': () => {
    const rows: ConfirmedTxn[] = confirmedTxns.map((row, index) =>
      index === 0 ? { ...row, entity: undefined } : row
    );
    return <Step groups={tagGroupsFrom(rows)} />;
  },
  empty: () => <Step groups={[]} />,
};
