import { BedDouble, Ticket } from 'lucide-react';

import type { JSX, ReactNode } from 'react';

/** Source date rail with a compact accommodation or activity marker. */
export function VisitTimelineRow({
  icon,
  date,
  children,
}: {
  icon: 'stay' | 'event';
  date: ReactNode;
  children: ReactNode;
}): JSX.Element {
  const Icon = icon === 'stay' ? BedDouble : Ticket;
  return (
    <div className="flex gap-4">
      <aside className="relative w-24 shrink-0 border-r-2 border-dotted border-app-accent/50 py-3 pr-5 text-right text-xs font-medium sm:w-28">
        <span className="absolute -right-4 top-3 flex size-8 items-center justify-center rounded-full bg-app-accent text-app-accent-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
        {date}
      </aside>
      <div className="min-w-0 flex-1 py-2 pl-2">{children}</div>
    </div>
  );
}
