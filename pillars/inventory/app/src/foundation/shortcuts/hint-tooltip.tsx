/** A control tooltip that keeps its shortcut hint beside the action label. */
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@pops/ui';

import { ShortcutHint } from './shortcut-hint';

import type { ReactElement } from 'react';

/** Props for {@link HintTooltip}. */
export interface HintTooltipProps {
  label: string;
  shortcutId?: string;
  /** A disabled control's reason replaces the normal label and hides its hint. */
  disabledReason?: string;
  children: ReactElement;
}

/** Wraps one control in a delayed tooltip with its optional shortcut hint. */
export function HintTooltip({
  label,
  shortcutId,
  disabledReason,
  children,
}: HintTooltipProps): ReactElement {
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
