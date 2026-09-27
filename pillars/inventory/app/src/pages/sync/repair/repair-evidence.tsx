import { Check, CircleSlash, RotateCcw } from 'lucide-react';

import { cn } from '@pops/ui';

import { formatWhen } from '../activity/when.js';
import { SheetSection } from '../sheet-section.js';

import type { ReactElement, ReactNode } from 'react';

import type { ConflictSide, HeldValue, RepairCase } from '../sync-model.js';

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
}): ReactElement {
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

function ConflictSides({ repair, now }: { repair: RepairCase; now: string }): ReactElement | null {
  if (!repair.mine || !repair.theirs) return null;
  const field = repair.kind === 'placement' ? 'Placement' : 'Name';
  const title = repair.kind === 'deleted-elsewhere' ? 'Both changes' : `${field}, two values`;
  return (
    <SheetSection title={title}>
      <div className="divide-y overflow-hidden rounded-lg border">
        <SideRow label="Held on phone" side={repair.mine} now={now} emphasis />
        <SideRow label="Saved now" side={repair.theirs} now={now} />
      </div>
    </SheetSection>
  );
}

const FIT: Readonly<Record<string, { text: string; ok: boolean }>> = {
  fits: { text: 'Still fits', ok: true },
  archived: { text: 'Field archived', ok: false },
  replaced: { text: 'Replaced', ok: false },
  'option-retired': { text: 'Option retired', ok: false },
  'now-required': { text: 'Now required', ok: false },
  'not-on-device': { text: 'Not on the phone yet', ok: false },
  'record-gone': { text: 'Record deleted', ok: false },
  'record-not-allowed': { text: 'No longer allowed', ok: false },
};

function FitLabel({ value }: { value: HeldValue }): ReactElement {
  const fit = FIT[value.fit] ?? { text: value.fit, ok: false };
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

/** Renders each held value and whether it still fits the current catalogue. */
export function HeldValues({
  title,
  values,
}: {
  title: string;
  values: readonly HeldValue[];
}): ReactElement {
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

function Fact({ children }: { children: ReactNode }): ReactElement {
  return <p className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">{children}</p>;
}

function Specific({ repair }: { repair: RepairCase }): ReactElement | null {
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

/** Shows the server's refusal reason after a device retry. */
export function RefusedNotice({
  refused,
  now,
}: {
  refused: NonNullable<RepairCase['refused']>;
  now: string;
}): ReactElement {
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

/** Renders every evidence field carried by one repair case. */
export function RepairEvidence({ repair, now }: { repair: RepairCase; now: string }): ReactElement {
  return (
    <>
      {repair.refused ? <RefusedNotice refused={repair.refused} now={now} /> : null}
      <ConflictSides repair={repair} now={now} />
      <Specific repair={repair} />
      {repair.held ? <HeldValues title={repair.held.title} values={repair.held.values} /> : null}
    </>
  );
}
