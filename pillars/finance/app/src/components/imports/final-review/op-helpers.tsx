import { Ban, Merge, Pencil, Plus, Trash2 } from 'lucide-react';

import { describeTag } from '../../../lib/tags';

import type { TagRuleAddCollision } from './useTagRuleAddCollisions';

export type ChangeSetOp =
  | { op: 'add'; data: { descriptionPattern: string; [k: string]: unknown } }
  | { op: 'edit'; id: string; data: { entityName?: string | null; [k: string]: unknown } }
  | { op: 'disable'; id: string }
  | { op: 'remove'; id: string };

export type TagRuleChangeSetOp =
  | { op: 'add'; data: { descriptionPattern: string; tags?: string[]; [k: string]: unknown } }
  | { op: 'edit'; id: string; data: Record<string, unknown> }
  | { op: 'disable'; id: string }
  | { op: 'remove'; id: string };

export const OP_BADGE: Record<string, { label: string; icon: React.ReactNode; className: string }> =
  {
    add: {
      label: 'Add',
      icon: <Plus className="h-3 w-3" />,
      className: 'bg-success/10 text-success dark:bg-success/10 dark:text-success/60',
    },
    edit: {
      label: 'Edit',
      icon: <Pencil className="h-3 w-3" />,
      className: 'bg-info/10 text-info dark:bg-info/10 dark:text-info/60',
    },
    disable: {
      label: 'Disable',
      icon: <Ban className="h-3 w-3" />,
      className: 'bg-warning/10 text-warning dark:bg-warning/10 dark:text-warning/60',
    },
    remove: {
      label: 'Remove',
      icon: <Trash2 className="h-3 w-3" />,
      className:
        'bg-destructive/10 text-destructive dark:bg-destructive/10 dark:text-destructive/60',
    },
  };

/**
 * A staged `add` op that resolves to an existing rule (POPS-2955) — never a
 * variant of `OP_BADGE.add`, so the two cannot be confused by a shared key.
 */
export const MERGE_BADGE: { label: string; icon: React.ReactNode; className: string } = {
  label: 'Merge',
  icon: <Merge className="h-3 w-3" />,
  className: 'bg-accent/10 text-accent-foreground dark:bg-accent/10 dark:text-accent-foreground/60',
};

export function opDisplayLabel(op: ChangeSetOp): string {
  switch (op.op) {
    case 'add':
      return op.data.descriptionPattern;
    case 'edit':
      return op.data.entityName ?? `Rule ${op.id.slice(0, 8)}`;
    case 'disable':
    case 'remove':
      return `Rule ${op.id.slice(0, 8)}`;
  }
}

/** `OP_BADGE.add`, unless `collision` says this `add` would merge (POPS-2955). */
export function tagRuleOpBadge(
  op: TagRuleChangeSetOp,
  collision: TagRuleAddCollision | null | undefined
): (typeof OP_BADGE)[string] | undefined {
  if (op.op === 'add' && collision) return MERGE_BADGE;
  return OP_BADGE[op.op];
}

function formatTags(tags: string[] | undefined): string {
  return tags?.length ? tags.map((tag) => describeTag(tag).ariaLabel).join(', ') : '';
}

/**
 * `collision` is the server-resolved answer to "would this `add` create a
 * rule or land on one that already exists?" (POPS-2955) — `undefined` while
 * unresolved (renders the plain add label), `null` once resolved and it
 * would create a new rule, and the existing rule's tags once resolved and it
 * would not.
 */
export function tagRuleOpDisplayLabel(
  op: TagRuleChangeSetOp,
  collision?: TagRuleAddCollision | null
): string {
  switch (op.op) {
    case 'add': {
      const newTags = formatTags(op.data.tags);
      if (collision) {
        const existing = formatTags(collision.existingTags) || '(no tags yet)';
        return `${op.data.descriptionPattern} — existing: ${existing}${newTags ? ` + ${newTags}` : ''}`;
      }
      return newTags ? `${op.data.descriptionPattern} → ${newTags}` : op.data.descriptionPattern;
    }
    case 'edit':
    case 'disable':
    case 'remove':
      return `Rule ${op.id.slice(0, 8)}`;
  }
}
