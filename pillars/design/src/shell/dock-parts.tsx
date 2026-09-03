import { createContext, useContext, useEffect, useState } from 'react';
import { Link } from 'react-router';

import { Button, cn, Popover, PopoverContent, PopoverTrigger } from '@pops/ui';

import type { ReactNode } from 'react';

/**
 * A counter the dock bumps to close whatever it has open.
 *
 * Radix dismisses a popover on a pointer press outside it, but the canvas is
 * an iframe: a press on the design produces no event in this document, so
 * "outside" never happens for the largest target on screen. The frame reports
 * the press up instead, and the dock turns it into a bump of this token.
 */
const DismissToken = createContext(0);

export function DockDismiss({ token, children }: { token: number; children: ReactNode }) {
  return <DismissToken.Provider value={token}>{children}</DismissToken.Provider>;
}

/**
 * The shared shapes of the dock's tools, so the four of them cannot drift:
 * a pill trigger that opens a popover above the dock, and the rows inside
 * it. Every trigger and row is a `Button` from `@pops/ui`, which is what
 * keeps them at the 44px touch target the primitive system enforces.
 */
export function DockTool({
  label,
  active,
  trigger,
  children,
  width = 'w-60',
}: {
  /** Accessible name of the trigger; also its tooltip. */
  label: string;
  /** Highlight the trigger when the tool is in a non-default state. */
  active?: boolean;
  trigger: ReactNode;
  children: ReactNode;
  width?: string;
}) {
  const token = useContext(DismissToken);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(false);
  }, [token]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={active ? 'default' : 'outline'}
          shape="pill"
          aria-label={label}
          title={label}
          className={cn('h-11 min-w-11 px-3 shadow-lg backdrop-blur-xl', !active && 'bg-card/80')}
        >
          {trigger}
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="center" sideOffset={8} className={cn('p-1.5', width)}>
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function DockGroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pt-2 pb-1 text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
      {children}
    </p>
  );
}

interface DockRowProps {
  current?: boolean;
  /** Navigate here on select; omit for an action row. */
  to?: string;
  onSelect?: () => void;
  /** Rendered at the row's trailing edge — a size, a check, a swatch. */
  trailing?: ReactNode;
  disabled?: boolean;
  children: ReactNode;
}

const rowClass = (current: boolean | undefined) =>
  cn('w-full justify-between font-normal', current && 'bg-accent text-accent-foreground');

/** One selectable row in a dock popover. Links navigate; everything else calls back. */
export function DockRow({ current, to, onSelect, trailing, disabled, children }: DockRowProps) {
  const content = (
    <>
      <span className="truncate">{children}</span>
      {trailing ? (
        <span className="ml-2 shrink-0 text-xs text-muted-foreground">{trailing}</span>
      ) : null}
    </>
  );
  if (to && !disabled) {
    return (
      <Button asChild variant="ghost" className={rowClass(current)}>
        <Link to={to} onClick={onSelect} aria-current={current ? 'true' : undefined}>
          {content}
        </Link>
      </Button>
    );
  }
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={disabled}
      aria-pressed={current}
      onClick={onSelect}
      className={rowClass(current)}
    >
      {content}
    </Button>
  );
}
