/**
 * A tooltip that says what a control does and which keys do it, so no
 * shortcut is hidden (spec 3.2). Icon-only controls always get one.
 */
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@pops/ui';

import { ShortcutHint } from './kbd';

import type { ReactElement } from 'react';

/** Props for {@link HintTooltip}. */
export interface HintTooltipProps {
  label: string;
  shortcutId?: string;
  /** A disabled control's reason replaces the label. */
  disabledReason?: string;
  children: ReactElement;
}

/** Wraps one control; the tooltip shows the label (or why it is disabled) and the key caps. */
export function HintTooltip({ label, shortcutId, disabledReason, children }: HintTooltipProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent className="flex items-center gap-2">
          <span>{disabledReason ?? label}</span>
          {shortcutId !== undefined && disabledReason === undefined ? (
            <ShortcutHint
              id={shortcutId}
              className="[&_kbd]:border-background/30 [&_kbd]:bg-background/15 [&_kbd]:text-background"
            />
          ) : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
