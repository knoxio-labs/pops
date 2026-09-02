import { OVERLAY_MARKER } from './anchors';
import { Thread } from './Thread';

import type { Thread as ThreadRow, ThreadStatus } from './api';

/**
 * The list of threads on this route, docked to the right of the surface.
 *
 * Threads are shown in the order they were written, resolved ones included:
 * a session that has just applied one leaves a reply on it, and hiding it the
 * instant its status changes would take the answer off screen with it.
 */
export function Panel({
  threads,
  onReply,
  onStatus,
  onClose,
}: {
  threads: ThreadRow[];
  onReply: (threadId: string, body: string) => void;
  onStatus: (threadId: string, status: ThreadStatus) => void;
  onClose: () => void;
}) {
  return (
    <aside
      {...{ [OVERLAY_MARKER]: '' }}
      className="fixed top-0 right-0 bottom-0 z-[58] flex w-80 flex-col border-l border-border bg-card text-card-foreground shadow-lg"
    >
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold">
          Comments <span className="text-muted-foreground">({threads.length})</span>
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Exit comments"
          className="flex size-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
        >
          ×
        </button>
      </header>
      {threads.length === 0 ? (
        <p className="p-3 text-sm text-muted-foreground">
          Click anything on the canvas to leave a comment.
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {threads.map((thread, i) => (
            <Thread
              key={thread.id}
              thread={thread}
              index={i + 1}
              onReply={(body) => onReply(thread.id, body)}
              onStatus={(status) => onStatus(thread.id, status)}
            />
          ))}
        </ul>
      )}
    </aside>
  );
}
