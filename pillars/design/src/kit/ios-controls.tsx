import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { ReactNode } from 'react';

/**
 * The pieces of iOS chrome a list screen needs that `frames/ios/primitives`
 * has no facsimile of yet: a search field, a grouped-list section header, a
 * small tag, and the two shapes a fact is shown in. They are built here rather
 * than taken from `@pops/ui` because this is the phone app; if the Swift
 * DesignSystem grows a primitive for any of them, its facsimile belongs beside
 * `PopsRow` and these should go.
 */
export function IosSearchField({
  value,
  placeholder = 'Search',
}: {
  value?: string;
  placeholder?: string;
}) {
  const empty = value === undefined || value === '';
  return (
    <div
      className="flex h-9 items-center gap-2 rounded-[10px] px-2"
      style={{ background: 'var(--ios-surface)' }}
    >
      <Search size={16} style={{ color: 'var(--ios-muted-foreground)' }} />
      <span
        className="ios-body flex-1 truncate"
        style={{ color: empty ? 'var(--ios-muted-foreground)' : 'var(--ios-foreground)' }}
      >
        {empty ? placeholder : value}
      </span>
      {empty ? null : (
        <span
          aria-hidden
          className="flex h-4 w-4 items-center justify-center rounded-full"
          style={{ background: 'var(--ios-muted-foreground)', color: 'var(--ios-background)' }}
        >
          <X size={11} />
        </span>
      )}
    </div>
  );
}

/** The uppercase label over a grouped list section. */
export function IosSectionHeader({ children }: { children: ReactNode }) {
  return (
    <h2
      className="ios-section-label px-1 tracking-wide uppercase"
      style={{ color: 'var(--ios-muted-foreground)' }}
    >
      {children}
    </h2>
  );
}

export type TagTone = 'neutral' | 'warning' | 'destructive' | 'success';

const TAG_COLOUR: Record<TagTone, string> = {
  neutral: 'var(--ios-muted-foreground)',
  warning: 'var(--ios-warning)',
  destructive: 'var(--ios-destructive)',
  success: 'var(--ios-success)',
};

export function IosTag({ children, tone = 'neutral' }: { children: ReactNode; tone?: TagTone }) {
  const colour = TAG_COLOUR[tone];
  return (
    <span
      className="ios-caption rounded-full px-2 py-0.5 whitespace-nowrap"
      style={{ color: colour, background: `color-mix(in srgb, ${colour} 14%, transparent)` }}
    >
      {children}
    </span>
  );
}

/**
 * One fact: a label, a number, and the line that qualifies it. Stacked rather
 * than laid out in a row because at 393pt a label and a value side by side is
 * the pair that collides first.
 */
export function IosStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="ios-caption" style={{ color: 'var(--ios-muted-foreground)' }}>
        {label}
      </p>
      <p className="ios-headline tabular-nums">{value}</p>
      {hint === undefined ? null : (
        <p className="ios-caption" style={{ color: 'var(--ios-muted-foreground)' }}>
          {hint}
        </p>
      )}
    </div>
  );
}

/** A single proportion — a limit used, a gift card spent down. */
export function IosMeter({ fraction, tone = 'neutral' }: { fraction: number; tone?: TagTone }) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full"
      style={{ background: 'var(--ios-separator)' }}
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.min(Math.max(fraction, 0), 1) * 100}%`,
          background: tone === 'neutral' ? 'var(--ios-accent)' : TAG_COLOUR[tone],
        }}
      />
    </div>
  );
}

/** A hairline between rows of a card, inset past the leading mark. */
export function IosHairline({ inset = 0 }: { inset?: number }) {
  return (
    <div style={{ marginLeft: inset, borderTop: '1px solid var(--ios-separator)' }} aria-hidden />
  );
}

/**
 * Tracks the phone's own scroll container (`.ios-device-content`, the
 * nearest scrolling ancestor a screen has) and reports past whether it has
 * scrolled beyond `threshold`. A screen has no ref to that ancestor of its
 * own — this hook finds it once mounted, the way a UINavigationBar reads its
 * scroll view rather than being handed it.
 */
export function useIosCollapsedTitle(threshold = 24) {
  const [collapsed, setCollapsed] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scrollEl = anchor.current?.closest('.ios-device-content');
    if (!scrollEl) return;
    const onScroll = () => setCollapsed(scrollEl.scrollTop > threshold);
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    return () => scrollEl.removeEventListener('scroll', onScroll);
  }, [threshold]);
  return { collapsed, anchor };
}

/**
 * The small centred title bar a large title collapses into once its own
 * heading scrolls out of reach — the standard `UINavigationBar` behaviour, so
 * a long list never loses the screen's identity to the fold.
 */
export function IosCollapsedTitleBar({ title, visible }: { title: string; visible: boolean }) {
  return (
    <div
      className="sticky top-0 z-10 -mx-4 -mt-4 mb-2 flex h-11 items-center justify-center px-4 backdrop-blur-xl transition-opacity"
      style={{
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        background: 'color-mix(in srgb, var(--ios-background) 82%, transparent)',
        borderBottom: visible ? '1px solid var(--ios-separator)' : '1px solid transparent',
      }}
    >
      <span className="ios-headline">{title}</span>
    </div>
  );
}
