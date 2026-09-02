import { iconMap } from '@pops/navigation';

import type { AppNavConfig } from '@pops/navigation';

/**
 * The active app's page list. Permanent from `lg` up; below that the shell
 * shows it as an overlay on demand, which a static frame has no way to
 * trigger, so here it is simply absent — the same space the content gets.
 */
export function PageNav({
  app,
  activePath,
}: {
  app: AppNavConfig;
  activePath: string | undefined;
}) {
  return (
    <nav
      className="hidden h-full w-50 overflow-y-auto border-r border-border bg-card lg:block"
      aria-label={`${app.label} pages`}
    >
      <div className="border-b border-border px-4 py-4">
        <span className="text-2xs font-bold uppercase tracking-label text-app-accent">
          {app.label}
        </span>
      </div>
      <div className="space-y-0.5 p-2">
        {app.items.map((item) => {
          const Icon = iconMap[item.icon];
          const active = item.path === activePath;
          return (
            <span
              key={`${app.basePath}${item.path}`}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                active ? 'bg-app-accent text-app-accent-foreground' : 'text-foreground/80'
              }`}
            >
              <Icon
                className={`size-4 shrink-0 ${active ? '' : 'text-app-accent/70'}`}
                aria-hidden
              />
              <span>{item.label}</span>
            </span>
          );
        })}
      </div>
    </nav>
  );
}
