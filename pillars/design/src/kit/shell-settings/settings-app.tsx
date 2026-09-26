/**
 * A facsimile of the shell's Settings app (`/settings`): the section nav on
 * the left, grouped by the pillar that owns each section, and the selected
 * section on the right under its title. The app is the shell's, not a
 * pillar's, so the frame draws no page nav and marks the rail's Settings
 * button instead. Only the section pane scrolls, as in the shell.
 */
import { Skeleton, cn } from '@pops/ui';

import { settingsNav } from './settings-sections';

import type { ReactNode } from 'react';

import type { SettingsManifestDescriptor } from '@pops/pillar-sdk/manifest-schema';

/** Props for {@link SettingsApp}. */
export interface SettingsAppProps {
  /** The section on show; it also stands in for the live section with its id in the nav. */
  section: SettingsManifestDescriptor;
  /** Drawn between the title and the groups: a connection banner. */
  banner?: ReactNode;
  loading?: boolean;
  children: ReactNode;
}

function SectionNav({
  activeId,
  section,
}: {
  activeId: string;
  section: SettingsManifestDescriptor;
}) {
  return (
    <nav className="space-y-4" aria-label="Settings sections">
      {settingsNav(section).map((group) => (
        <div key={group.label}>
          <p className="mb-1 px-3 text-xs font-semibold tracking-wide text-muted-foreground/70 uppercase">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.entries.map((entry) => {
              const active = entry.id === activeId;
              const Icon = entry.icon;
              return (
                <span
                  key={entry.id}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium',
                    active
                      ? 'bg-app-accent text-app-accent-foreground shadow-sm'
                      : 'text-foreground/80'
                  )}
                >
                  {Icon ? (
                    <Icon
                      className={cn(
                        'size-4 shrink-0',
                        active ? 'text-app-accent-foreground' : 'text-app-accent/70'
                      )}
                      aria-hidden
                    />
                  ) : null}
                  {entry.title}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

/** The Settings app with one section selected. */
export function SettingsApp({ section, banner, loading = false, children }: SettingsAppProps) {
  return (
    <div className="flex h-[calc(100dvh-5.5rem)] min-h-0 md:h-[calc(100dvh-7rem)] lg:h-[calc(100dvh-8rem)]">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border/50 md:flex">
        <div className="border-b border-border/50 p-4">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Settings
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <SectionNav activeId={section.id} section={section} />
        </div>
      </aside>
      <div className="min-w-0 flex-1 overflow-y-auto p-6">
        <h2 className="mb-4 text-lg font-semibold">{section.title}</h2>
        {banner}
        {loading ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
