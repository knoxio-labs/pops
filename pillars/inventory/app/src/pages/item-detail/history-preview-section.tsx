import { History } from 'lucide-react';
import { useNavigate } from 'react-router';

import { EmptyLine, PaneLabel } from '../../foundation/item-page/section-parts';
import { VerbButton } from '../../foundation/item-page/verb-button';

import type { ReactElement } from 'react';

/** Renders the compact history preview and its route to the full event list. */
export function HistoryPreviewSection({
  itemId,
  eventCount,
}: {
  itemId: string;
  eventCount: number | null;
}): ReactElement {
  const navigate = useNavigate();
  const label = eventCount !== null && eventCount > 1 ? `All ${eventCount} events` : 'Open history';
  let preview: ReactElement;
  if (eventCount === null) {
    preview = <EmptyLine icon={History} text="History is loading." />;
  } else if (eventCount === 0) {
    preview = <EmptyLine icon={History} text="Nothing recorded yet." />;
  } else {
    preview = (
      <p className="text-sm text-muted-foreground">
        {eventCount} {eventCount === 1 ? 'event' : 'events'} recorded.
      </p>
    );
  }
  return (
    <section aria-label="History" className="flex flex-col gap-3">
      <PaneLabel
        trailing={
          <VerbButton
            label={label}
            icon={History}
            shortcutId="detail-history"
            onClick={() => navigate(`/inventory/items/${itemId}/history`)}
          />
        }
      >
        History
      </PaneLabel>
      {preview}
    </section>
  );
}
