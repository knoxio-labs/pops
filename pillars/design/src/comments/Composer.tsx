import { useState } from 'react';

import { OVERLAY_MARKER } from './anchors';

import type { Anchor } from './anchors-types';

/**
 * The bubble that opens where a comment was pinned. Deliberately plain: it is
 * chrome sitting over a design, and anything decorative here would be
 * mistaken for part of the design underneath it.
 */
export function Composer({
  anchor,
  at,
  onSubmit,
  onCancel,
}: {
  anchor: Anchor;
  at: { x: number; y: number };
  onSubmit: (body: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  const label = anchor.kind === 'source' ? anchor.source : anchor.text;

  return (
    <div
      {...{ [OVERLAY_MARKER]: '' }}
      className="fixed z-[60] w-72 rounded-lg border border-border bg-card p-3 text-card-foreground shadow-lg"
      style={{ left: at.x, top: at.y }}
    >
      <p className="mb-2 truncate font-mono text-2xs text-muted-foreground">{label}</p>
      <textarea
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && value.trim() !== '') {
            onSubmit(value.trim());
          }
        }}
        placeholder="What is wrong with this?"
        className="h-20 w-full resize-none rounded-md border border-border bg-background p-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-11 rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={value.trim() === ''}
          onClick={() => onSubmit(value.trim())}
          className="h-11 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-50"
        >
          Comment
        </button>
      </div>
    </div>
  );
}
