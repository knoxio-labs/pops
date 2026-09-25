/**
 * Sheets for cases that have closed: settled (both sides now agree, with
 * Undo while it is on offer), and let go (the phone dropped its change;
 * what fit can still be saved from here).
 */
import { CircleCheck } from 'lucide-react';

import { Button } from '@pops/ui';

import { formatWhen } from '../activity/when';
import { ShortcutHint } from '../shared/kbd';
import { SheetPanel } from '../shared/sheet';
import { HeldValues, SheetSection } from './repair-evidence';
import { OnDevice } from './repair-sheet';
import { describeValues, valuesThatFit } from './sync-model';

import type { ResolvedEntry } from './sync-model';

/** After a web action made both sides agree. */
export function SettledSheet({
  entry,
  device,
  now,
  remaining,
  onClose,
}: {
  entry: ResolvedEntry;
  device: string;
  now: string;
  remaining: number;
  onClose?: () => void;
}) {
  return (
    <SheetPanel
      title={entry.itemName}
      description={`Settled ${formatWhen(entry.at, now)}`}
      onClose={onClose}
      className="rounded-xl"
      footer={
        <>
          <Button size="sm" variant="outline" suffix={<ShortcutHint id="undo" />}>
            Undo
          </Button>
          <Button size="sm">{remaining > 0 ? `Next case, ${remaining} left` : 'Done'}</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border bg-muted/40 px-3 py-3"
        >
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-app-accent" aria-hidden />
          <div className="text-sm">
            <p className="font-medium">{entry.outcome}.</p>
            <p className="text-muted-foreground">
              Moved from here, so both copies match. {device} closed the case when it next synced.
            </p>
          </div>
        </div>
        <OnDevice device={device}>
          Nothing left to do. The item no longer shows Needs attention.
        </OnDevice>
      </div>
    </SheetPanel>
  );
}

/** After the phone chose Let go: what was dropped, and saving what still fits. */
export function LetGoSheet({
  entry,
  device,
  now,
  onClose,
}: {
  entry: ResolvedEntry;
  device: string;
  now: string;
  onClose?: () => void;
}) {
  const dropped = entry.dropped ?? [];
  const fitting = valuesThatFit(dropped);
  return (
    <SheetPanel
      title={entry.itemName}
      description={`Let go on ${device} ${formatWhen(entry.at, now)}. Nothing was saved.`}
      onClose={onClose}
      className="rounded-xl"
      footer={
        <>
          <Button size="sm" variant="outline">
            Open {entry.itemName}
          </Button>
          {fitting.length > 0 ? (
            <Button size="sm">Save {describeValues(fitting)} here</Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-5">
        <HeldValues title="The dropped change" values={dropped} />
        <SheetSection title="From this web app">
          <p className="text-sm">
            {fitting.length > 0
              ? `${describeValues(fitting)} still fits and can be saved now. The rest cannot be stored under the current catalogue.`
              : 'None of it fits the current catalogue, so there is nothing to save.'}
          </p>
        </SheetSection>
      </div>
    </SheetPanel>
  );
}
