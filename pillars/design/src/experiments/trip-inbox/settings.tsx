import { Badge, ComboboxSelect } from '@pops/ui';

import { inboxArrangements, inboxIntentions } from './model';

import type { InboxNewTargetDraft } from './model';

/** Show and edit explicit lifecycle selections using the source-owned option catalogues. */
export function InboxTargetSettings({
  draft,
  change,
}: {
  draft: InboxNewTargetDraft;
  change: (next: InboxNewTargetDraft) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="block space-y-1 text-xs">
        <span>Intent</span>
        <ComboboxSelect
          aria-label="New item intent"
          value={draft.intention}
          options={inboxIntentions.map((item) => ({ value: item.id, label: item.label }))}
          onChange={(value) => {
            if (typeof value === 'string') change({ ...draft, intention: value });
          }}
        />
      </label>
      <label className="block space-y-1 text-xs">
        <span>Booking state</span>
        <ComboboxSelect
          aria-label="New item booking state"
          value={draft.arrangement}
          options={inboxArrangements.map((item) => ({ value: item.id, label: item.label }))}
          onChange={(value) => {
            if (typeof value === 'string') change({ ...draft, arrangement: value });
          }}
        />
      </label>
    </div>
  );
}

/** Keep the actual new item's selected intent and booking state visible before creation. */
export function InboxTargetState({ draft }: { draft: InboxNewTargetDraft }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="New item state">
      <Badge variant="outline" className="font-normal">
        {inboxIntentions.find((item) => item.id === draft.intention)?.label}
      </Badge>
      <Badge variant="outline" className="font-normal">
        {inboxArrangements.find((item) => item.id === draft.arrangement)?.label}
      </Badge>
    </div>
  );
}
