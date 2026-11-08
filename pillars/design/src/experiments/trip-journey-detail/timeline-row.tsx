import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Dates and mode markers align with the same rail across journey legs and nearby bookings. */
export function JourneyTimelineRow({
  day,
  Icon,
  children,
}: {
  day: string;
  Icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-5">
      <aside className="relative w-24 shrink-0 border-r-2 border-dotted border-app-accent/50 pr-6 pt-4 text-right text-xs font-medium text-foreground/90 sm:w-28">
        {day}
        <span className="absolute -right-4 top-3 flex size-8 items-center justify-center rounded-full bg-app-accent text-app-accent-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
      </aside>
      <div className="min-w-0 flex-1 py-2">{children}</div>
    </div>
  );
}
