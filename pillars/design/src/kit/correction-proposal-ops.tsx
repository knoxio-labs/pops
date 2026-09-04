import {
  correctionOps,
  matchTypeOptions,
  opKindBadgeVariant,
  opKindLabel,
  transactionTypeOptions,
  type CorrectionOpFixture,
} from '@/fixtures/import-correction';
import { Trash2 } from 'lucide-react';

import { Badge, Button, Input, Label, Select, Separator, Textarea } from '@pops/ui';

/**
 * The correction-proposal dialog's left column (the ops list) and middle
 * column (the per-op-kind detail editor). See `correction-proposal-impact`
 * for the right column and the bottom bars.
 */

export function OpsList({ selectedId }: { selectedId: string }) {
  return (
    <div className="flex flex-col min-h-0 border-r">
      <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b">
        Operations ({correctionOps.length})
      </div>
      <ul className="flex-1 overflow-auto divide-y">
        {correctionOps.map((op) => (
          <li
            key={op.clientId}
            className={`px-3 py-2 ${op.clientId === selectedId ? 'bg-muted' : ''}`}
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Badge variant={opKindBadgeVariant[op.kind]} className="text-2xs h-4 px-1.5">
                    {opKindLabel[op.kind]}
                  </Badge>
                  {op.dirty && (
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-warning"
                      title="Unsaved edits — preview stale"
                    />
                  )}
                </div>
                <div className="text-xs truncate" title={op.summary}>
                  {op.summary}
                </div>
              </div>
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" aria-label="Delete operation" />
            </div>
          </li>
        ))}
      </ul>
      <div className="border-t p-2">
        <Button variant="outline" size="sm" className="w-full">
          + Add new rule
        </Button>
      </div>
    </div>
  );
}

function TargetRuleCard({ rule }: { rule: NonNullable<CorrectionOpFixture['targetRule']> }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">Target rule</div>
      <div className="text-sm">
        <code className="rounded bg-background px-1 py-0.5 text-xs">{rule.pattern}</code> ·{' '}
        <span className="text-xs">{rule.matchType}</span>
      </div>
      <div className="text-xs text-muted-foreground">
        {[rule.entityName, rule.location, rule.transactionType].filter(Boolean).join(' · ') ||
          'no outcome set'}
      </div>
    </div>
  );
}

function OutcomeFields({ op }: { op: CorrectionOpFixture }) {
  return (
    <>
      <div className="space-y-1">
        <Label>Entity</Label>
        <Input value={op.entityName ?? ''} placeholder="Search entities…" readOnly />
      </div>
      <div className="space-y-1">
        <Label>Transaction type</Label>
        <Select value={op.transactionType ?? ''} options={transactionTypeOptions} disabled />
      </div>
      <div className="space-y-1">
        <Label>Location</Label>
        <Input value={op.location ?? ''} readOnly />
      </div>
    </>
  );
}

export function DetailPanel({ op, rationale }: { op: CorrectionOpFixture; rationale: string }) {
  if (op.kind === 'add') {
    return (
      <div className="p-6 overflow-auto space-y-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Add new rule</div>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Description pattern</Label>
            <Input value={op.descriptionPattern ?? ''} placeholder="e.g. WOOLWORTHS" readOnly />
          </div>
          <div className="space-y-1">
            <Label>Match type</Label>
            <Select value={op.matchType ?? 'contains'} options={matchTypeOptions} disabled />
          </div>
          <OutcomeFields op={op} />
        </div>
      </div>
    );
  }
  if (op.kind === 'edit') {
    return (
      <div className="p-6 overflow-auto space-y-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Edit rule</div>
        {op.targetRule && <TargetRuleCard rule={op.targetRule} />}
        <Separator />
        <div className="space-y-3">
          <OutcomeFields op={op} />
        </div>
      </div>
    );
  }
  return (
    <div className="p-6 overflow-auto space-y-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">Disable rule</div>
      {op.targetRule && <TargetRuleCard rule={op.targetRule} />}
      <div className="space-y-2">
        <Label>Rationale (optional)</Label>
        <Textarea
          value={rationale}
          placeholder="Why is this rule being disabled?"
          rows={3}
          readOnly
        />
      </div>
    </div>
  );
}
