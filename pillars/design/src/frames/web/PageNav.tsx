import { iconMap } from '@pops/navigation';

import type { AppNavConfig } from '@pops/navigation';

function NavItem({
  item,
  active,
  emphasis = false,
}: {
  item: AppNavConfig['items'][number];
  active: boolean;
  emphasis?: boolean;
}) {
  const Icon = iconMap[item.icon];
  return (
    <span
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${
        emphasis ? 'font-semibold' : 'font-medium'
      } ${active ? 'bg-app-accent text-app-accent-foreground' : 'text-foreground/80'}`}
    >
      <Icon
        className={`shrink-0 ${emphasis ? 'size-4.5' : 'size-4'} ${active ? '' : 'text-app-accent/70'}`}
        aria-hidden
      />
      <span>{item.label}</span>
    </span>
  );
}

/**
 * The active app's page list. Permanent from `lg` up; below that the shell
 * shows it as an overlay on demand, which a static frame has no way to
 * trigger, so here it is simply absent — the same space the content gets.
 *
 * The first item is every app's home — its dashboard, its landing page — so
 * it stands apart from the pages under it rather than reading as one more
 * row the same weight as "Tag Rules": its own row, a size up, with a
 * hairline beneath it before the rest of the list starts.
 */
export function PageNav({
  app,
  activePath,
}: {
  app: AppNavConfig;
  activePath: string | undefined;
}) {
  const [home, ...rest] = app.items;
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
      {home ? (
        <div className="space-y-2 border-b border-border p-2 pb-3">
          <NavItem item={home} active={home.path === activePath} emphasis />
        </div>
      ) : null}
      <div className="space-y-0.5 p-2">
        {rest.map((item) => (
          <NavItem
            key={`${app.basePath}${item.path}`}
            item={item}
            active={item.path === activePath}
          />
        ))}
      </div>
    </nav>
  );
}
