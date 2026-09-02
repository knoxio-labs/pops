import { iconMap } from '@pops/navigation';

import type { AppNavConfig } from '@pops/navigation';

/**
 * The app rail: every installed app's icon, the active one marked with the
 * shell's left-edge indicator. Visible from `md` up, exactly as the shell's
 * `NavRegion` has it.
 */
export function AppRail({
  apps,
  activeId,
}: {
  apps: readonly AppNavConfig[];
  activeId: string | undefined;
}) {
  return (
    <div className="hidden w-16 shrink-0 flex-col gap-2 border-r border-border bg-card py-2 md:flex">
      {apps.map((app) => {
        const Icon = iconMap[app.icon];
        const active = app.id === activeId;
        return (
          <div key={app.id} className="relative flex justify-center" title={app.label}>
            {active ? (
              <span
                className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-app-accent"
                aria-hidden
              />
            ) : null}
            <span
              className={`inline-flex size-11 items-center justify-center rounded-xl ${
                active ? 'bg-app-accent/15 text-app-accent' : 'text-foreground/60'
              }`}
              aria-hidden
            >
              <Icon className="size-5" />
            </span>
          </div>
        );
      })}
    </div>
  );
}
