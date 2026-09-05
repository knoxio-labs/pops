import { PopsTextField } from '@/frames/ios/fields';
import { PopsCard } from '@/frames/ios/primitives';
import { IosSectionHeader } from '@/kit/ios-controls';
import { CircleCheck, CircleMinus, Info, TriangleAlert } from 'lucide-react';

import type { ReceiptLine } from '@/fixtures/receipts';
import type { FieldNote } from '@/frames/ios/fields';
import type { ReactNode } from 'react';

/** A section of the draft form: a label, and the card its fields sit in. */
export function DraftSection({
  label,
  trailing,
  children,
}: {
  label: string;
  trailing?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <IosSectionHeader>{label}</IosSectionHeader>
        {trailing === undefined ? null : (
          <span className="ios-caption" style={{ color: 'var(--ios-muted-foreground)' }}>
            {trailing}
          </span>
        )}
      </div>
      <PopsCard>{children}</PopsCard>
    </section>
  );
}

/**
 * A line, editable. The description and the amount sit on one row because
 * that is how the paper prints them, and the quantity and the unit note sit
 * under it in caption type: they qualify the line rather than being another
 * two things to fill in.
 */
export function DraftLineRow({ line, amountNote }: { line: ReceiptLine; amountNote?: FieldNote }) {
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <PopsTextField placeholder="What it was" value={line.description} />
        <div className="w-28 shrink-0">
          <PopsTextField
            placeholder="0.00"
            value={line.amount}
            type="ios-monospaced"
            align="right"
            note={amountNote}
          />
        </div>
        <button
          type="button"
          aria-label={`Remove ${line.description || 'this item'}`}
          className="mt-2 flex h-11 w-11 items-center justify-center"
          style={{ color: 'var(--ios-muted-foreground)' }}
        >
          <CircleMinus size={18} />
        </button>
      </div>
      <div className="flex gap-3 pl-1">
        <div className="w-16 shrink-0">
          <PopsTextField
            label="Qty"
            placeholder="—"
            value={line.quantity === undefined ? undefined : String(line.quantity)}
            type="ios-caption"
          />
        </div>
        <PopsTextField
          placeholder="Unit price or weight"
          value={line.unitNote}
          type="ios-caption"
        />
      </div>
    </div>
  );
}

export type Reconciliation = 'agreed' | 'mismatched' | 'changed';

const RECONCILIATION: Record<
  Reconciliation,
  { text: string; colour: string; Icon: typeof CircleCheck }
> = {
  agreed: {
    text: 'As read, the items and the total agree.',
    colour: 'var(--ios-success)',
    Icon: CircleCheck,
  },
  mismatched: {
    text: "As read, the items didn't add up to the total.",
    colour: 'var(--ios-warning)',
    Icon: TriangleAlert,
  },
  changed: {
    text: 'The figures have changed since they were checked.',
    colour: 'var(--ios-accent)',
    Icon: Info,
  },
};

/**
 * What the gate said about the arithmetic, and nothing more. This line never
 * recomputes: an app that added the figures up itself and disagreed with the
 * pillar would be a second opinion the reader has no way to settle.
 */
export function ReconciliationNote({ state, suffix }: { state: Reconciliation; suffix?: string }) {
  const { text, colour, Icon } = RECONCILIATION[state];
  return (
    <div className="flex items-start gap-2 pt-1">
      <Icon size={14} className="mt-0.5 shrink-0" style={{ color: colour }} />
      <p className="ios-caption" style={{ color: colour }}>
        {text}
        {suffix === undefined ? '' : ` ${suffix}`}
      </p>
    </div>
  );
}
