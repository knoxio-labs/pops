/**
 * Layout shell for `/food/data`. Renders the page header + a tab strip
 * that links to each sub-route under `/food/data/<slug>`. On narrow
 * viewports the strip collapses to a kit Select dropdown. Active tab comes
 * from the URL — no client-side tab state.
 */
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';

import { Select, type SelectOption } from '@pops/ui';

import { GlobalSearchBar } from './GlobalSearchBar.js';
import { DEFAULT_TAB_SLUG, FOOD_DATA_TABS, type FoodDataTab } from './tab-config.js';

function tabBaseClasses(): string {
  return 'inline-flex items-center whitespace-nowrap rounded-md border border-transparent px-3 py-1.5 text-sm font-medium transition-colors';
}

function activeTabClasses(isActive: boolean): string {
  return isActive
    ? 'bg-primary text-primary-foreground'
    : 'text-muted-foreground hover:bg-muted hover:text-foreground';
}

/**
 * Resolve the active tab from the URL. Matches by which tab's slug is the
 * leading segment under `/food/data`, so future nested routes like
 * `/food/data/aliases/<id>` still keep the Aliases tab marked active.
 *
 * Exported for direct unit testing — the router-driven tests can't exercise
 * paths that don't have a matching route declared.
 */
export function getActiveTabSlug(pathname: string): FoodDataTab['slug'] {
  const idx = pathname.indexOf('/data/');
  if (idx === -1) return DEFAULT_TAB_SLUG;
  const tail = pathname.slice(idx + '/data/'.length);
  const leading = tail.split('/')[0] ?? '';
  const match = FOOD_DATA_TABS.find((tab) => tab.slug === leading);
  return match?.slug ?? DEFAULT_TAB_SLUG;
}

function FoodDataDesktopTabs({ activeSlug }: { activeSlug: FoodDataTab['slug'] }) {
  const { t } = useTranslation('food');
  return (
    <nav
      role="tablist"
      aria-label={t('data.tabs.ariaLabel')}
      className="hidden flex-wrap items-center gap-1 sm:flex"
    >
      {FOOD_DATA_TABS.map((tab) => {
        const isActive = tab.slug === activeSlug;
        return (
          <NavLink
            key={tab.slug}
            to={tab.slug}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            className={`${tabBaseClasses()} ${activeTabClasses(isActive)}`}
          >
            {t(tab.labelKey)}
          </NavLink>
        );
      })}
    </nav>
  );
}

function FoodDataMobileTabs({ activeSlug }: { activeSlug: FoodDataTab['slug'] }) {
  const { t } = useTranslation('food');
  const navigate = useNavigate();
  const options: SelectOption[] = FOOD_DATA_TABS.map((tab) => ({
    value: tab.slug,
    label: t(tab.labelKey),
  }));
  return (
    <div className="sm:hidden">
      <Select
        aria-label={t('data.tabs.ariaLabel')}
        value={activeSlug}
        onChange={(event) => navigate(event.target.value)}
        options={options}
      />
    </div>
  );
}

export function FoodDataLayout() {
  const { t } = useTranslation('food');
  const location = useLocation();
  const activeSlug = getActiveTabSlug(location.pathname);

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">{t('data.title')}</h1>
        <p className="text-muted-foreground max-w-2xl">{t('data.intro')}</p>
      </header>

      <GlobalSearchBar />

      <FoodDataDesktopTabs activeSlug={activeSlug} />
      <FoodDataMobileTabs activeSlug={activeSlug} />

      <section aria-label={t('data.tabs.contentAriaLabel')}>
        <Outlet />
      </section>
    </div>
  );
}
