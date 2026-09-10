import { useEffect, useRef } from 'react';

import { entryDomId, QueueEntryRow } from './queue-entry-row';

import type { QueueEntry } from '@/fixtures/purchases-queue';
import type { KeyboardEvent, ReactElement } from 'react';

import type { QueueCursor } from './cursor';
import type { DecisionKind } from './types';

type KeyAction = 'next' | 'prev' | DecisionKind;

/**
 * `j`/`k`/`enter`/`x`, as the ticket specifies, plus the arrow keys a
 * listbox is required to answer so the view is not keyboard-hostile to
 * anyone driving it with a screen reader.
 */
const KEY_ACTIONS: Readonly<Record<string, KeyAction>> = {
  j: 'next',
  ArrowDown: 'next',
  k: 'prev',
  ArrowUp: 'prev',
  Enter: 'accept',
  x: 'reject',
};

function actionFor(event: KeyboardEvent<HTMLUListElement>): KeyAction | undefined {
  if (event.ctrlKey || event.metaKey || event.altKey) return undefined;
  return KEY_ACTIONS[event.key] ?? KEY_ACTIONS[event.key.toLowerCase()];
}

interface QueueListProps {
  entries: QueueEntry[];
  cursor: QueueCursor;
  onDecide: (entry: QueueEntry, kind: DecisionKind) => void;
  /** Skip the focus-on-mount effect: the states view wants a fixed selection. */
  autoFocus?: boolean;
}

/**
 * The queue as a single listbox.
 *
 * One tab stop for the whole inbox, with `aria-activedescendant` naming the
 * row under the cursor. Hundreds of rows each holding their own tab stop is
 * the mouse round-trip the ticket is trying to avoid, in keyboard form.
 */
export function QueueList({
  entries,
  cursor,
  onDecide,
  autoFocus = true,
}: QueueListProps): ReactElement {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (autoFocus && document.activeElement === document.body) listRef.current?.focus();
  }, [autoFocus]);

  function handleKeyDown(event: KeyboardEvent<HTMLUListElement>): void {
    const action = actionFor(event);
    if (action === undefined) return;
    event.preventDefault();

    if (action === 'next' || action === 'prev') {
      cursor.moveBy(action === 'next' ? 1 : -1);
      return;
    }
    if (cursor.activeEntry === undefined) return;
    onDecide(cursor.activeEntry, action);
  }

  return (
    <ul
      ref={listRef}
      role="listbox"
      tabIndex={0}
      aria-label="Charges awaiting a decision"
      aria-activedescendant={
        cursor.activeChargeId === null ? undefined : entryDomId(cursor.activeChargeId)
      }
      onKeyDown={handleKeyDown}
      className="space-y-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {entries.map((entry) => (
        <QueueEntryRow
          key={entry.chargeId}
          entry={entry}
          isActive={entry.chargeId === cursor.activeChargeId}
          onSelect={cursor.select}
        />
      ))}
    </ul>
  );
}
