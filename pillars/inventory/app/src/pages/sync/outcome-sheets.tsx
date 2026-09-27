import { CircleCheck } from 'lucide-react';
import { useNavigate } from 'react-router';

import { Button, SheetPanel } from '@pops/ui';

import { formatWhen } from '../../foundation/feedback/when.js';
import { HeldValues } from './repair/repair-evidence.js';
import { OnDevice } from './repair/repair-sheet-content.js';
import { SheetSection } from './sheet-section.js';
import { describeValues, valuesThatFit } from './sync-model.js';

import type { ReactElement } from 'react';

import type { ResolvedEntry } from './sync-model.js';

/** Shows the result of a web repair after both sides agree. */
export function SettledSheet({
  entry,
  device,
  now,
  remaining,
  onClose,
  onNext,
}: {
  entry: ResolvedEntry;
  device: string;
  now: string;
  remaining: number;
  onClose: () => void;
  onNext?: () => void;
}): ReactElement {
  return (
    <SheetPanel
      title={entry.itemName}
      description={`Settled ${formatWhen(entry.at, now)}`}
      onClose={onClose}
      className="rounded-xl"
      footer={
        <Button size="sm" onClick={onNext ?? onClose}>
          {remaining > 0 ? `Next case, ${remaining} left` : 'Done'}
        </Button>
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

/** Shows the values a device dropped when it chose to let a case go. */
export function LetGoSheet({
  entry,
  device,
  now,
  onClose,
}: {
  entry: ResolvedEntry;
  device: string;
  now: string;
  onClose: () => void;
}): ReactElement {
  const navigate = useNavigate();
  const dropped = entry.dropped ?? [];
  const fitting = valuesThatFit(dropped);
  return (
    <SheetPanel
      title={entry.itemName}
      description={`Let go on ${device} ${formatWhen(entry.at, now)}. Nothing was saved.`}
      onClose={onClose}
      className="rounded-xl"
      footer={
        entry.itemId === undefined ? undefined : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => void navigate(`/inventory/items/${entry.itemId}`)}
          >
            Open {entry.itemName}
          </Button>
        )
      }
    >
      <div className="space-y-5">
        <HeldValues title="The dropped change" values={dropped} />
        <SheetSection title="From this web app">
          <p className="text-sm">
            {fitting.length > 0
              ? `${describeValues(fitting)} still fits and can be saved from the item. The rest cannot be stored under the current catalogue.`
              : 'None of it fits the current catalogue, so there is nothing to save.'}
          </p>
        </SheetSection>
      </div>
    </SheetPanel>
  );
}
