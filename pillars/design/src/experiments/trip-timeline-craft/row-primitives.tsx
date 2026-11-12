import { Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';

import { Badge, Button, cn, Collapsible, CollapsibleContent, CollapsibleTrigger } from '@pops/ui';

import type { CraftArrangementState } from '@/fixtures/trip-timeline-craft';
import type { ReactNode } from 'react';

/** Text and shape accompany state; unknown never becomes a booking or an idea. */
export function ArrangementMark({ state }: { state: CraftArrangementState }) {
  if (state === null)
    return <span className="text-xs text-muted-foreground">Booking not supplied</span>;
  if (state !== 'Purchased') return <span className="text-sm text-muted-foreground">{state}</span>;
  return (
    <Badge variant="secondary" className="gap-1 border-border bg-background">
      <Check aria-hidden />
      Purchased
    </Badge>
  );
}

/** Notes are available in place, with an explicit keyboard-accessible disclosure. */
export function CraftNotes({ children }: { children?: string }) {
  const [open, setOpen] = useState(false);
  if (!children) return null;
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="min-h-11 gap-1 px-0 text-sm text-muted-foreground hover:bg-transparent"
        >
          Notes <ChevronDown className={cn('size-4', open && 'rotate-180')} aria-hidden />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="max-w-prose pb-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** One source position in the shared date and place rail. */
export function RailRow({
  date,
  icon,
  children,
}: {
  date?: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="min-w-0 sm:flex sm:gap-6">
      <div className="mb-2 pl-9 text-sm text-muted-foreground sm:mb-0 sm:w-24 sm:shrink-0 sm:pt-1 sm:pl-0 sm:text-right">
        {date}
      </div>
      <div className="relative ml-3 min-w-0 flex-1 border-l border-border pb-8 pl-6 sm:pb-10 sm:pl-8">
        <span className="absolute -left-3 top-0 flex size-6 items-center justify-center bg-background text-muted-foreground">
          {icon}
        </span>
        {children}
      </div>
    </li>
  );
}
