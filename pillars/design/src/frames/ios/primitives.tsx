import type { ReactNode } from 'react';

/**
 * HTML facsimiles of the DesignSystem primitives in
 * `clients/ios/Packages/DesignSystem/Sources/DesignSystem/Primitives`.
 *
 * Facsimiles, not ports: nothing here is generated from the Swift, nothing
 * shares code with it, and the two can drift. They are named after their Swift
 * counterparts so a screen designed here can be described to whoever
 * implements it in one word — "a PopsRow inside a PopsCard" — rather than in a
 * paragraph of layout. The colours and the type scale are the parts that do
 * not drift: those are generated from the app's asset catalogue and mapped
 * from `PopsFont.swift`.
 *
 * Spacing follows `PopsSpacing` (xs 4, sm 8, md 12, lg 16, xl 24, xxl 32) and
 * the radii follow `PopsRadius` (control 8, card 12).
 */

/** `PopsCard`: a raised container that owns its surface, padding and radius. */
export function PopsCard({ children }: { children: ReactNode }) {
  return (
    <div
      className="w-full rounded-xl p-4"
      style={{
        background: 'var(--ios-surface)',
        border: '1px solid var(--ios-separator)',
      }}
    >
      {children}
    </div>
  );
}

/** `PopsRow`: a headline, an optional supporting line, optional trailing content. */
export function PopsRow({
  title,
  subtitle,
  trailing,
}: {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="ios-headline truncate">{title}</span>
        {subtitle === undefined ? null : (
          <span className="ios-subheadline" style={{ color: 'var(--ios-muted-foreground)' }}>
            {subtitle}
          </span>
        )}
      </div>
      {trailing}
    </div>
  );
}

/**
 * `PopsButton`: outlined by default, filled for the one action a screen exists
 * to offer. The filled variant draws its label in `popsBackground` on
 * `popsAccent`, the pair the app's contrast test measures.
 */
export function PopsButton({
  children,
  prominence = 'standard',
  disabled = false,
}: {
  children: ReactNode;
  prominence?: 'standard' | 'prominent';
  disabled?: boolean;
}) {
  const filled = prominence === 'prominent';
  return (
    <button
      type="button"
      disabled={disabled}
      className="ios-headline min-h-11 rounded-lg px-4 disabled:opacity-40"
      style={{
        background: filled ? 'var(--ios-accent)' : 'transparent',
        color: filled ? 'var(--ios-background)' : 'var(--ios-accent)',
        border: filled ? 'none' : '1px solid var(--ios-accent)',
      }}
    >
      {children}
    </button>
  );
}

/**
 * `PopsActionBar`: the actions a screen ends in, held in a bar the content
 * scrolls under. In the app the background is a system material rather than a
 * token, so content is visibly behind it; the blur below is the closest CSS
 * gets and is the one place this file knowingly approximates.
 */
export function PopsActionBar({ children }: { children: ReactNode }) {
  return (
    <div
      className="sticky bottom-0 flex gap-2 p-4 backdrop-blur"
      style={{
        background: 'color-mix(in srgb, var(--ios-background) 80%, transparent)',
        borderTop: '1px solid var(--ios-separator)',
      }}
    >
      {children}
    </div>
  );
}

/**
 * `PopsGlassButton`: a floating hero action in Apple's Liquid Glass material
 * — translucent, blurred, with a specular highlight along its top edge — for
 * the one action a screen exists to drive, in place of a full-width action
 * bar. There is no Swift facsimile to name this after yet: the DesignSystem
 * package has no glass primitive, so this screen is the first design to ask
 * for one (POPS-2823 tracks building it natively).
 *
 * Fixed to the phone itself, not the scrolling content, via the
 * `translateZ(0)` on `.ios-device` — it stays put while the screen scrolls
 * under it, the way a real floating action button would.
 */
export function PopsGlassButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="fixed z-10 flex min-h-12 items-center gap-2 rounded-full px-5 backdrop-blur-xl transition-transform active:scale-95"
      style={{
        right: 16,
        bottom: 'calc(var(--ios-safe-area-inset-bottom) + 16px)',
        background: `linear-gradient(155deg,
          color-mix(in srgb, var(--ios-accent) 65%, transparent) 0%,
          color-mix(in srgb, var(--ios-accent) 78%, transparent) 60%,
          color-mix(in srgb, var(--ios-accent) 88%, transparent) 100%)`,
        color: 'var(--ios-background)',
        border: '1px solid color-mix(in srgb, white 40%, transparent)',
        boxShadow:
          '0 10px 30px rgba(0, 0, 0, 0.28), inset 0 1px 0 color-mix(in srgb, white 55%, transparent)',
      }}
    >
      {children}
    </button>
  );
}

/** `StateView`: the shared body of the loading, empty and error screens. */
export function StateView({
  message,
  tone = 'muted',
  accessory,
}: {
  message: string;
  tone?: 'muted' | 'destructive';
  accessory?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p
        className="ios-body"
        style={{
          color: tone === 'destructive' ? 'var(--ios-destructive)' : 'var(--ios-muted-foreground)',
        }}
      >
        {message}
      </p>
      {accessory}
    </div>
  );
}
