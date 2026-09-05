import { PopsButton, StateView } from './primitives';

import type { ReactNode } from 'react';

/**
 * The three screens a surface shows instead of itself, and the header a
 * surface opens with when it has an answer to report — facsimiles of
 * `DesignSystem/Primitives/{Loading,Empty,Error}StateView.swift` and
 * `PopsStatusHeader.swift`.
 *
 * They are separate from `primitives.tsx` only because that file is at its
 * line budget; they are the same kind of thing and the same rules apply.
 */

/** The Swift fallbacks, used when a caller passes nothing. */
export const STATE_FALLBACK = {
  loading: 'Loading…',
  empty: 'Nothing here yet.',
  error: 'Something went wrong.',
  retry: 'Retry',
} as const;

function Spinner() {
  return (
    <span
      aria-hidden
      className="h-5 w-5 animate-spin rounded-full border-2"
      style={{
        borderColor: 'color-mix(in srgb, var(--ios-accent) 25%, transparent)',
        borderTopColor: 'var(--ios-accent)',
      }}
    />
  );
}

export function LoadingStateView({ message = STATE_FALLBACK.loading }: { message?: string }) {
  return <StateView message={message} accessory={<Spinner />} />;
}

/** No accessory at all: an empty list offers nothing to press, and says so. */
export function EmptyStateView({ message = STATE_FALLBACK.empty }: { message?: string }) {
  return <StateView message={message} />;
}

export function ErrorStateView({
  message = STATE_FALLBACK.error,
  retryTitle = STATE_FALLBACK.retry,
}: {
  message?: string;
  retryTitle?: string;
}) {
  return (
    <StateView
      message={message}
      tone="destructive"
      accessory={<PopsButton>{retryTitle}</PopsButton>}
    />
  );
}

export type StatusTone = 'success' | 'warning' | 'danger' | 'information';

const STATUS_COLOUR: Record<StatusTone, string> = {
  success: 'var(--ios-success)',
  warning: 'var(--ios-warning)',
  danger: 'var(--ios-destructive)',
  information: 'var(--ios-accent)',
};

/**
 * The glyph is the point: two outcomes that differ only in their wording are
 * two screens a reader has to read to tell apart, and someone who has just
 * pressed a button is scanning. The tone picks the symbol, never the caller.
 */
export function PopsStatusHeader({
  tone,
  title,
  message,
  caption,
  glyph,
}: {
  tone: StatusTone;
  title: string;
  message: string;
  caption?: string;
  glyph: ReactNode;
}) {
  return (
    <header className="flex w-full flex-col gap-3">
      <span aria-hidden style={{ color: STATUS_COLOUR[tone] }}>
        {glyph}
      </span>
      <div className="space-y-2">
        <h1 className="ios-title">{title}</h1>
        <p className="ios-body" style={{ color: 'var(--ios-muted-foreground)' }}>
          {message}
        </p>
        {caption === undefined ? null : (
          <p className="ios-caption" style={{ color: 'var(--ios-muted-foreground)' }}>
            {caption}
          </p>
        )}
      </div>
    </header>
  );
}
