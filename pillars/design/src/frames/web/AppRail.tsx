import { Settings } from 'lucide-react';

import { iconMap } from '@pops/navigation';

import type { AppNavConfig } from '@pops/navigation';

/**
 * The shell's Settings button, anchored to the foot of the rail as its
 * `AppRailFooter` has it. Settings is the shell's app, not a pillar's, so it
 * is marked in muted grey rather than an app accent.
 */
function SettingsButton({ active }: { active: boolean }) {
  return (
    <div className="relative mt-auto flex justify-center" title="Settings">
      {active ? (
        <span
          className="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-muted-foreground"
          aria-hidden
        />
      ) : null}
      <span
        className={`inline-flex size-12 items-center justify-center rounded-xl ${
          active ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground'
        }`}
        aria-current={active ? 'page' : undefined}
        aria-label="Settings"
      >
        <Settings className="size-6" aria-hidden />
      </span>
    </div>
  );
}

/**
 * The app rail: every installed app's icon, the active one marked with the
 * shell's left-edge indicator, and Settings at the foot. Visible from `md`
 * up, exactly as the shell's `NavRegion` has it.
 */
export function AppRail({
  apps,
  activeId,
  settingsActive = false,
}: {
  apps: readonly AppNavConfig[];
  activeId: string | undefined;
  settingsActive?: boolean;
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
      <SettingsButton active={settingsActive} />
    </div>
  );
}
