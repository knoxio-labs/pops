/**
 * What a repair sheet shows as the facts of a case: the two sides of a
 * conflict, the code and its holder, the photo against the limit, or the
 * held change with each value's fit under the current catalogue.
 */
import { Check, CircleSlash, RotateCcw } from 'lucide-react';

import { cn } from '@pops/ui';

import { formatWhen } from '../activity/when';

import type { ReactNode } from 'react';

import type { ConflictSide, HeldValue, RepairCase, ValueFit } from './sync-model';

/** A labelled block inside the sheet. */
export function SheetSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-2xs font-semibold uppercase tracking-label text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function SideRow({
  label,
  side,
  now,
  emphasis,
}: {
  label: string;
  side: ConflictSide;
  now: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2.5',
        emphasis && 'bg-app-accent/10'
      )}
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{side.value}</span>
        <span className="block text-xs text-muted-foreground">
          {side.source} · {formatWhen(side.at, now)}
        </span>
      </span>
    </div>
  );
}

function ConflictSides({ repair, now }: { repair: RepairCase; now: string }) {
  if (!repair.mine || !repair.theirs) return null;
  const field = repair.kind === 'placement' ? 'Placement' : 'Name';
  return (
    <SheetSection
      title={repair.kind === 'deleted-elsewhere' ? 'Both changes' : `${field}, two values`}
    >
      <div className="divide-y overflow-hidden rounded-lg border">
        <SideRow label="Held on phone" side={repair.mine} now={now} emphasis />
        <SideRow label="Saved now" side={repair.theirs} now={now} />
      </div>
    </SheetSection>
  );
}

const FIT: Readonly<Record<ValueFit, { text: string; ok: boolean }>> = {
  fits: { text: 'Still fits', ok: true },
  archived: { text: 'Field archived', ok: false },
  replaced: { text: 'Replaced', ok: false },
  'option-retired': { text: 'Option retired', ok: false },
  'now-required': { text: 'Now required', ok: false },
  'not-on-device': { text: 'Not on the phone yet', ok: false },
  'record-gone': { text: 'Record deleted', ok: false },
  'record-not-allowed': { text: 'No longer allowed', ok: false },
};

function FitLabel({ value }: { value: HeldValue }) {
  const fit = FIT[value.fit];
  const Icon = fit.ok ? Check : CircleSlash;
  const text =
    value.fit === 'replaced' && value.replacement ? `Replaced by ${value.replacement}` : fit.text;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs',
        fit.ok ? 'text-muted-foreground' : 'text-foreground'
      )}
    >
      <Icon
        className={cn('size-3.5', fit.ok ? 'text-muted-foreground' : 'text-warning')}
        aria-hidden
      />
      {text}
    </span>
  );
}

/** The held change, one value per row, each with whether it still fits. */
export function HeldValues({ title, values }: { title: string; values: readonly HeldValue[] }) {
  return (
    <SheetSection title={title}>
      <div className="divide-y overflow-hidden rounded-lg border">
        {values.map((value) => (
          <div
            key={value.field}
            className="grid grid-cols-[7rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2"
          >
            <span className="truncate text-xs text-muted-foreground">{value.field}</span>
            <span className="truncate text-sm">{value.value}</span>
            <FitLabel value={value} />
          </div>
        ))}
      </div>
    </SheetSection>
  );
}

function Fact({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">{children}</p>;
}

function Specific({ repair }: { repair: RepairCase }) {
  if (repair.code) {
    return (
      <Fact>
        <span className="font-mono">{repair.code.wanted}</span> is printed on {repair.code.holder}.
        The next free code is <span className="font-mono font-medium">{repair.code.suggested}</span>
        .
      </Fact>
    );
  }
  if (repair.photo) {
    return (
      <Fact>
        The photo is {repair.photo.size}; uploads stop at {repair.photo.limit}. It is still on the
        phone.
      </Fact>
    );
  }
  return null;
}

/** The refusal after a retry: when, and the server's reason, word for word. */
export function RefusedNotice({
  refused,
  now,
}: {
  refused: NonNullable<RepairCase['refused']>;
  now: string;
}) {
  return (
    <div
      role="status"
      className="flex gap-2.5 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm"
    >
      <RotateCcw className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <p>
        <span className="font-medium">Retried {formatWhen(refused.at, now)} and refused.</span>{' '}
        {refused.reason}
      </p>
    </div>
  );
}

/** Every fact the case carries. */
export function RepairEvidence({ repair, now }: { repair: RepairCase; now: string }) {
  return (
    <>
      {repair.refused ? <RefusedNotice refused={repair.refused} now={now} /> : null}
      <ConflictSides repair={repair} now={now} />
      <Specific repair={repair} />
      {repair.held ? <HeldValues title={repair.held.title} values={repair.held.values} /> : null}
    </>
  );
}
