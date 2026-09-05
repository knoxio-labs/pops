import { LayoutGrid, ListTree, ScanText, Wallet } from 'lucide-react';

import type { ComponentType } from 'react';

interface IosTab {
  slug: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
}

/**
 * BFM's tabs, authored here rather than read from a real `navConfig` the way
 * the web frame reads each pillar's page nav — the iOS app is native Swift
 * and has nothing in `@pops/navigation` to read.
 *
 * The first three are `RootFeature.renderable`, in the app's own order, with
 * the app's own labels: "purchases" is lower-case and generically iconed
 * because `RootCopy.name(of:)`/`symbol(for:)` special-case only Transactions
 * and Receipts, so that is literally what a paired phone draws
 * today. The playground shows it as it is rather than tidying it, because a
 * tidied facsimile is one nobody would ever fix.
 *
 * Accounts is the odd one out and is deliberately last: `FeatureAccounts` is
 * built but not on `RootFeature.renderable` — BFM has no `/mobile` accounts
 * route to bootstrap against — so it is a tab in this design and not yet one
 * on a device. The tab set the app should settle on is POPS-2822.
 *
 * The app draws no tab bar at all below two available features, and this
 * frame does not model that: which tabs a given server offers is a runtime
 * answer, and the shell screen is where those counts are reviewed.
 */
const TABS: IosTab[] = [
  { slug: 'transactions', label: 'Transactions', icon: ListTree },
  { slug: 'purchases', label: 'purchases', icon: LayoutGrid },
  { slug: 'receipt-capture', label: 'Receipts', icon: ScanText },
  { slug: 'accounts', label: 'Accounts', icon: Wallet },
];

export { TABS as IOS_TABS };

/**
 * The tab a screen belongs to. Receipts has no navigation stack — the result
 * and the draft replace the prompt inside the tab rather than being pushed
 * over it — so they keep the bar, and the tab under them stays lit.
 */
const TAB_OF: Record<string, string> = {
  'receipt-result': 'receipt-capture',
  'receipt-draft': 'receipt-capture',
};

function tabFor(slug: string | undefined): string | undefined {
  if (slug === undefined) return undefined;
  return TAB_OF[slug] ?? slug;
}

/** A tab bar shows only over a tab's own root — never over a pushed or presented screen. */
export function tabBarVisible(area: string | undefined, slug: string | undefined): boolean {
  const tab = tabFor(slug);
  return area === 'mobile' && TABS.some((entry) => entry.slug === tab);
}

export function IosTabBar({ activeSlug }: { activeSlug: string | undefined }) {
  const active = tabFor(activeSlug);
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
        const colour = tab.slug === active ? 'var(--ios-accent)' : 'var(--ios-muted-foreground)';
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
