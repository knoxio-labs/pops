import { LayoutGrid, Wallet } from 'lucide-react';

import type { ComponentType } from 'react';

interface IosTab {
  slug: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
}

/**
 * BFM's primary sections, authored here rather than read from a real
 * `navConfig` the way the web frame reads each pillar's page nav — the iOS
 * app is native Swift and has nothing in `@pops/navigation` to read. Only
 * "Accounts" is a tab this design has actually built; "More" stands in for
 * everything else BFM will need and is not itself a routable screen. The
 * full tab set is a decision this session did not make — filed as
 * POPS-2822.
 */
const TABS: IosTab[] = [
  { slug: 'accounts', label: 'Accounts', icon: Wallet },
  { slug: 'more', label: 'More', icon: LayoutGrid },
];

/** A tab bar shows only over a tab's own root — never over a pushed or presented screen. */
export function tabBarVisible(area: string | undefined, slug: string | undefined): boolean {
  return area === 'mobile' && TABS.some((tab) => tab.slug === slug);
}

export function IosTabBar({ activeSlug }: { activeSlug: string | undefined }) {
  return (
    <nav
      className="absolute inset-x-0 bottom-0 z-10 flex items-stretch justify-around backdrop-blur-xl"
      style={{
        paddingBottom: 'var(--ios-safe-area-inset-bottom)',
        background: 'color-mix(in srgb, var(--ios-background) 82%, transparent)',
        borderTop: '1px solid var(--ios-separator)',
      }}
      aria-label="Tabs"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = tab.slug === activeSlug;
        const colour = active ? 'var(--ios-accent)' : 'var(--ios-muted-foreground)';
        return (
          <div
            key={tab.slug}
            className="flex flex-1 flex-col items-center gap-0.5 pt-1.5 pb-1"
            style={{ color: colour }}
          >
            <Icon size={22} />
            <span className="ios-caption">{tab.label}</span>
          </div>
        );
      })}
    </nav>
  );
}
