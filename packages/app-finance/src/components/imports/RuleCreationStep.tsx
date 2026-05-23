import { useMemo, useState } from 'react';

import { Badge, Button, Checkbox, Chip, hashToColor, Label } from '@pops/ui';

import { useImportStore } from '../../store/importStore';

import type { TagRuleChangeSet } from '@pops/api/modules/core/tag-rules/types';
import type { ConfirmedTransaction } from '@pops/api/modules/finance/imports';

interface RuleProposal {
  id: string;
  entityId: string | null;
  entityName: string;
  pattern: string;
  tags: string[];
  affectsCount: number;
}

type EntityGroup = { entityId: string | null; entityName: string; txns: ConfirmedTransaction[] };

function groupByEntity(txns: ConfirmedTransaction[]): Map<string, EntityGroup> {
  const groups = new Map<string, EntityGroup>();
  for (const txn of txns) {
    if (!txn.tags?.length) continue;
    const key = txn.entityId ?? `desc:${txn.description.slice(0, 30)}`;
    const name = txn.entityName ?? txn.description.slice(0, 30);
    if (!groups.has(key))
      groups.set(key, { entityId: txn.entityId ?? null, entityName: name, txns: [] });
    groups.get(key)?.txns.push(txn);
  }
  return groups;
}

function commonTagsForGroup(group: EntityGroup): string[] {
  const counts = new Map<string, number>();
  for (const txn of group.txns) {
    for (const tag of new Set(txn.tags ?? [])) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  const threshold = Math.ceil(group.txns.length * 0.5);
  return [...counts.entries()]
    .filter(([, c]) => c >= threshold)
    .toSorted((a, b) => b[1] - a[1])
    .map(([tag]) => tag);
}

function computeProposals(confirmedTransactions: ConfirmedTransaction[]): RuleProposal[] {
  const proposals: RuleProposal[] = [];
  let seq = 0;
  for (const [, group] of groupByEntity(confirmedTransactions)) {
    const tags = commonTagsForGroup(group);
    if (!tags.length) continue;
    proposals.push({
      id: `proposal-${seq++}`,
      entityId: group.entityId,
      entityName: group.entityName,
      pattern: group.entityName.toLowerCase(),
      tags,
      affectsCount: group.txns.length,
    });
  }
  return proposals;
}

function buildChangeSet(proposal: RuleProposal): TagRuleChangeSet {
  return {
    source: 'import-batch',
    reason: `Rule detected from import batch tags for ${proposal.entityName}`,
    ops: [
      {
        op: 'add',
        data: {
          descriptionPattern: proposal.pattern,
          matchType: 'contains',
          entityId: proposal.entityId,
          tags: proposal.tags,
          confidence: 0.9,
          isActive: true,
        },
      },
    ],
  };
}

function ProposalCard({
  proposal,
  checked,
  onToggle,
}: {
  proposal: RuleProposal;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`rounded-lg border p-4 space-y-3 transition-colors cursor-pointer ${
        checked ? 'border-info/40 bg-info/5' : 'border-border bg-card hover:border-border/80'
      }`}
      onClick={onToggle}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          id={proposal.id}
          checked={checked}
          onCheckedChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5"
        />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Label htmlFor={proposal.id} className="font-medium cursor-pointer">
              {proposal.entityName}
            </Label>
            <Badge variant="secondary" className="text-xs">
              {proposal.affectsCount} {proposal.affectsCount === 1 ? 'transaction' : 'transactions'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground font-mono">
            contains &ldquo;{proposal.pattern}&rdquo;
          </p>
          <div className="flex flex-wrap gap-1.5">
            {proposal.tags.map((tag) => (
              <Chip key={tag} style={hashToColor(tag)} className="text-xs">
                {tag}
              </Chip>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center space-y-2">
      <p className="text-sm text-muted-foreground">No tag patterns detected in this import.</p>
      <p className="text-xs text-muted-foreground">
        Tag transactions in the previous step to enable rule detection.
      </p>
    </div>
  );
}

function StepFooter({
  onSkip,
  onCreate,
  selectedCount,
  hasProposals,
}: {
  onSkip: () => void;
  onCreate: () => void;
  selectedCount: number;
  hasProposals: boolean;
}) {
  return (
    <div className="flex justify-between pt-2">
      <Button variant="outline" onClick={onSkip}>
        Skip
      </Button>
      {hasProposals && (
        <Button onClick={onCreate} disabled={selectedCount === 0}>
          Create {selectedCount > 0 ? `${selectedCount} ` : ''}
          {selectedCount === 1 ? 'rule' : 'rules'} →
        </Button>
      )}
    </div>
  );
}

export function RuleCreationStep() {
  const confirmedTransactions = useImportStore((s) => s.confirmedTransactions);
  const addPendingTagRuleChangeSet = useImportStore((s) => s.addPendingTagRuleChangeSet);
  const nextStep = useImportStore((s) => s.nextStep);
  const proposals = useMemo(() => computeProposals(confirmedTransactions), [confirmedTransactions]);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(proposals.map((p) => p.id)));

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleCreate() {
    for (const proposal of proposals.filter((p) => checked.has(p.id))) {
      addPendingTagRuleChangeSet({ changeSet: buildChangeSet(proposal), source: 'import-batch' });
    }
    nextStep();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Create rules</h2>
        <p className="text-sm text-muted-foreground mt-1">
          These tag patterns were detected from this import. Saved rules apply automatically on
          future imports.
        </p>
      </div>
      {proposals.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {proposals.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              checked={checked.has(proposal.id)}
              onToggle={() => toggle(proposal.id)}
            />
          ))}
        </div>
      )}
      <StepFooter
        onSkip={nextStep}
        onCreate={handleCreate}
        selectedCount={proposals.filter((p) => checked.has(p.id)).length}
        hasProposals={proposals.length > 0}
      />
    </div>
  );
}
