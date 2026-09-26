/**
 * The badges a row, card or header can carry: code, quantity, type,
 * lifecycle, sync, container state and in hand. Each pairs its icon with a
 * word, and each quiet case (active, synced, quantity 1) draws nothing.
 */
import { Badge, cn } from '@pops/ui';

import { INVENTORY_ICONS } from '../model/icons';

import type { InventoryConcept } from '../model/icons';
import type { ContainerFacts, Lifecycle, SyncState } from '../model/model';

/** How loud a badge is. Red is never a badge tone: red is for irreversible acts. */
export type BadgeTone = 'neutral' | 'accent' | 'warning' | 'strong-warning';

const TONES: Readonly<Record<BadgeTone, string>> = {
  neutral: 'border-border bg-background text-muted-foreground',
  accent: 'border-app-accent/40 bg-app-accent/10 text-foreground',
  warning: 'border-warning/30 bg-warning/10 text-foreground',
  'strong-warning': 'border-warning bg-warning/20 text-foreground',
};

const ICON_TONES: Readonly<Record<BadgeTone, string>> = {
  neutral: 'text-muted-foreground',
  accent: 'text-app-accent',
  warning: 'text-warning',
  'strong-warning': 'text-warning',
};

/** The shared badge shape: an icon, a word, one tone. */
export function ConceptBadge({
  concept,
  label,
  tone = 'neutral',
  className,
}: {
  concept: InventoryConcept;
  label: string;
  tone?: BadgeTone;
  className?: string;
}) {
  const Icon = INVENTORY_ICONS[concept];
  return (
    <Badge
      variant="outline"
      className={cn('h-5 gap-1 px-1.5 text-2xs font-medium', TONES[tone], className)}
    >
      <Icon className={cn('size-3', ICON_TONES[tone])} aria-hidden />
      {label}
    </Badge>
  );
}

/** The printed-label code, in mono. Draws nothing for an uncoded item unless asked. */
export function CodeBadge({ code, showNone = false }: { code: string | null; showNone?: boolean }) {
  const Icon = INVENTORY_ICONS.code;
  if (code === null) {
    return showNone ? <span className="text-xs text-muted-foreground">No code</span> : null;
  }
  return (
    <span className="relative inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
      <Icon className="size-3.5" aria-hidden />
      <span className="sr-only">Code</span>
      {code}
    </span>
  );
}

/** How many identical things one record stands for. Quantity 1 draws nothing. */
export function QuantityBadge({ quantity }: { quantity: number }) {
  if (quantity <= 1) return null;
  return <ConceptBadge concept="quantity" label={`×${quantity}`} />;
}

/** The item's type, or the literal word Untyped. */
export function TypeLabel({ typeName }: { typeName: string | null }) {
  const Icon = INVENTORY_ICONS.type;
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1 text-xs',
        typeName === null ? 'text-muted-foreground' : 'text-foreground'
      )}
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate">{typeName ?? 'Untyped'}</span>
    </span>
  );
}

const LIFECYCLE: Readonly<
  Record<Exclude<Lifecycle, 'active'>, { concept: InventoryConcept; label: string }>
> = {
  retired: { concept: 'retired', label: 'Retired' },
  discarded: { concept: 'discarded', label: 'Discarded' },
  lost: { concept: 'lost', label: 'Lost' },
  destroyed: { concept: 'destroyed', label: 'Destroyed' },
};

/** Lifecycle. Active is the quiet case and draws nothing. */
export function LifecycleBadge({ lifecycle }: { lifecycle: Lifecycle }) {
  if (lifecycle === 'active') return null;
  const { concept, label } = LIFECYCLE[lifecycle];
  return <ConceptBadge concept={concept} label={label} />;
}

const SYNC: Readonly<
  Record<
    Exclude<SyncState, 'synced'>,
    { concept: InventoryConcept; label: string; tone: BadgeTone }
  >
> = {
  queued: { concept: 'sync', label: 'Queued', tone: 'neutral' },
  sending: { concept: 'sync', label: 'Saving', tone: 'neutral' },
  stale: { concept: 'stale', label: 'Changed elsewhere', tone: 'warning' },
  'needs-attention': {
    concept: 'needsAttention',
    label: 'Needs attention',
    tone: 'strong-warning',
  },
};

/** Sync, at the prominence it earns: synced draws nothing, stale and needs attention cannot be missed. */
export function SyncBadge({ sync }: { sync: SyncState }) {
  if (sync === 'synced') return null;
  const { concept, label, tone } = SYNC[sync];
  return (
    <ConceptBadge
      concept={concept}
      label={label}
      tone={tone}
      className={sync === 'sending' ? '[&>svg]:motion-safe:animate-spin' : undefined}
    />
  );
}

/** A container's access, plus Full when a person has marked it so. */
export function ContainerStateBadge({ container }: { container: ContainerFacts | null }) {
  if (container === null) return null;
  const open = container.access === 'open';
  return (
    <span className="inline-flex items-center gap-1">
      <ConceptBadge
        concept={open ? 'open' : 'closed'}
        label={open ? 'Open' : 'Closed'}
        tone={open ? 'accent' : 'neutral'}
      />
      {container.full ? <ConceptBadge concept="full" label="Full" /> : null}
    </span>
  );
}

/** In hand, as a badge for rows that are not already in the In hand list. */
export function InHandBadge() {
  return <ConceptBadge concept="inHand" label="In hand" tone="accent" />;
}
