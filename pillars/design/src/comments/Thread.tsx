import { useState } from 'react';

import { anchorLabel, parseAnchor } from './anchors';
import { THREAD_STATUSES, type Thread as ThreadRow, type ThreadStatus } from './api';

/** One thread in the panel: its anchor, its messages, a reply box and its status. */
export function Thread({
  thread,
  index,
  onReply,
  onStatus,
}: {
  thread: ThreadRow;
  index: number;
  onReply: (body: string) => void;
  onStatus: (status: ThreadStatus) => void;
}) {
  const [reply, setReply] = useState('');

  return (
    <li className="border-b border-border px-3 py-2 last:border-b-0">
      <p className="truncate font-mono text-2xs text-muted-foreground">
        {index}. {anchorLabel(parseAnchor(thread))}
      </p>
      <ul className="mt-1 space-y-1">
        {thread.messages.map((message) => (
          <li key={message.id} className="text-sm">
            <span className="text-muted-foreground">{message.author}: </span>
            {message.body}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center gap-2">
        <input
          value={reply}
          onChange={(event) => setReply(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && reply.trim() !== '') {
              onReply(reply.trim());
              setReply('');
            }
          }}
          placeholder="Reply"
          aria-label={`Reply to comment ${index}`}
          className="h-11 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />
        <select
          value={thread.status}
          onChange={(event) => onStatus(event.target.value as ThreadStatus)}
          aria-label={`Status of comment ${index}`}
          className="h-11 rounded-md border border-border bg-background px-2 text-sm"
        >
          {THREAD_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>
    </li>
  );
}
