import { AppRail } from './AppRail';
import { activeItemPath, appForArea, WEB_APPS } from './apps';
import { PageNav } from './PageNav';
import { TopBar } from './TopBar';

import type { ReactNode } from 'react';

/**
 * The POPS web chrome, as a facsimile: top bar, app rail, page nav, content.
 *
 * A facsimile rather than the shell's own `RootLayout` because importing that
 * would reach past `@pops/app-*`'s entry into shell internals (ISO-R2) and
 * drag the boot registry, the overlay hosts and the search stack in with it.
 * What is real is the data: the rail and the page nav are drawn from each app
 * package's actual `navConfig`. Retiring this in favour of an extracted
 * chrome lib is POPS-2783.
 *
 * Breakpoints match `RootLayout`: rail and page nav from 1024, rail alone
 * from 768, neither below. The frame is inside the canvas iframe, so those
 * are the simulated widths.
 */
export function WebFrame({
  area,
  slug,
  children,
}: {
  area: string | undefined;
  slug: string | undefined;
  children: ReactNode;
}) {
  const app = appForArea(area);
  const accent = app?.color ? `app-${app.color}` : undefined;

  return (
    <div className={`min-h-screen bg-background ${accent ?? ''}`}>
      <div className="pt-14 md:pt-16">
        <TopBar />
        <div className="flex">
          <div className="sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 md:flex md:top-16 md:h-[calc(100vh-4rem)]">
            <AppRail apps={WEB_APPS} activeId={app?.id} />
            {app ? <PageNav app={app} activePath={activeItemPath(app, slug)} /> : null}
          </div>
          <main className="mx-auto min-w-0 max-w-screen-2xl flex-1 overflow-x-clip p-4 md:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
