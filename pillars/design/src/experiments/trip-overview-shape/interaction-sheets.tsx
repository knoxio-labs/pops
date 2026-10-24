import { useState } from 'react';

import { Badge, Button, Sheet, TextInput } from '@pops/ui';

import type { TripOverviewItem } from '@/fixtures/trip-overview';

function ItemDetails({
  item,
  onPlan,
}: {
  item: TripOverviewItem;
  onPlan: (id: string, intention: TripOverviewItem['intention']) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{item.intention}</Badge>
        <Badge variant={item.arrangement === 'Booked' ? 'default' : 'outline'}>
          {item.arrangement}
        </Badge>
      </div>
      <dl className="space-y-4 text-sm">
        <div>
          <dt className="text-muted-foreground">Where</dt>
          <dd className="mt-1 font-medium">{item.where}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">When</dt>
          <dd className="mt-1 font-medium">{item.when}</dd>
        </div>
      </dl>
      <p className="text-sm leading-relaxed">{item.notes}</p>
      <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
        <h3 className="font-medium">Plan status</h3>
        <p className="text-sm text-muted-foreground">
          Putting this in the plan does not book it or change other dates. You can keep alternatives
          alongside it.
        </p>
        <Button
          variant="outline"
          onClick={() => onPlan(item.id, item.intention === 'In plan' ? 'Considering' : 'In plan')}
        >
          {item.intention === 'In plan' ? 'Keep as a possibility' : 'Add to working plan'}
        </Button>
      </div>
    </div>
  );
}

/** Inspect an item and change intention without changing its booking status. */
export function OverviewItemSheet({
  item,
  onClose,
  onPlan,
}: {
  item: TripOverviewItem | null;
  onClose: () => void;
  onPlan: (id: string, intention: TripOverviewItem['intention']) => void;
}) {
  return (
    <Sheet
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={item?.title ?? 'Item'}
      description="Trip item"
      footer={
        <Button onClick={onClose} variant="outline">
          Close
        </Button>
      }
    >
      {item && <ItemDetails item={item} onPlan={onPlan} />}
    </Sheet>
  );
}

/** Local-only capture; dates and locations are optional and input is not uploaded. */
export function OverviewCaptureSheet({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (title: string) => void;
}) {
  const [title, setTitle] = useState('');
  function save() {
    const trimmed = title.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setTitle('');
    onClose();
  }
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Add to inbox"
      description="Add a note or link. City and dates are optional."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!title.trim()} onClick={save}>
            Save to inbox
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <TextInput
          label="Note or link"
          placeholder="Paste a link or enter a note"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              save();
            }
          }}
        />
        <p className="text-sm text-muted-foreground">
          No date or city required. Saved locally in this prototype until you reload.
        </p>
      </div>
    </Sheet>
  );
}
