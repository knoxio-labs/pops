import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { entryDomId, QueueEntryRow } from './QueueEntryRow.js';

import type { KeyboardEvent, ReactElement } from 'react';

import type { DecisionKind, QueueEntry } from './types.js';
import type { QueueCursor } from './useQueueCursor.js';

type KeyAction = 'next' | 'prev' | DecisionKind;

/**
 * `j`/`k`/`enter`/`x`, as the ticket specifies, plus the arrow keys a listbox
 * is required to answer so the view is not keyboard-hostile to anyone driving
 * it with a screen reader.
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
  // Let the browser keep its own chords — ctrl+k is a shell shortcut, not a
  // request to move the cursor up.
  if (event.ctrlKey || event.metaKey || event.altKey) return undefined;
  return KEY_ACTIONS[event.key] ?? KEY_ACTIONS[event.key.toLowerCase()];
}

interface QueueListProps {
  entries: QueueEntry[];
  cursor: QueueCursor;
  isDeciding: boolean;
  onDecide: (entry: QueueEntry, kind: DecisionKind) => void;
}

/**
 * The queue as a single listbox.
 *
 * One tab stop for the whole inbox, with `aria-activedescendant` naming the
 * row under the cursor. Hundreds of rows each holding their own tab stop is
 * the mouse round-trip the ticket is trying to avoid, in keyboard form.
 */
export function QueueList({ entries, cursor, isDeciding, onDecide }: QueueListProps): ReactElement {
  const { t } = useTranslation('purchases');
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    // Claim focus only when nothing else has it. The queue is the page, so
    // arriving ready for `j` is the point — but stealing focus from the shell's
    // search box because a refetch happened to land is not.
    if (document.activeElement === document.body) listRef.current?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLUListElement>): void {
    const action = actionFor(event);
    if (action === undefined) return;
    event.preventDefault();

    if (action === 'next' || action === 'prev') {
      cursor.moveBy(action === 'next' ? 1 : -1);
      return;
    }
    // A second Enter while the first is in flight would confirm the same links
    // twice and race the refetch that decides where the cursor lands.
    if (isDeciding || cursor.activeEntry === undefined) return;
    onDecide(cursor.activeEntry, action);
  }

  return (
    <ul
      ref={listRef}
      role="listbox"
      tabIndex={0}
      aria-label={t('reconcile.list.ariaLabel')}
      aria-activedescendant={
        cursor.activeChargeId === null ? undefined : entryDomId(cursor.activeChargeId)
      }
      onKeyDown={handleKeyDown}
      className="focus-visible:ring-ring space-y-3 rounded-md focus-visible:outline-none focus-visible:ring-2"
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
