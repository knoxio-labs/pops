import { useRegisteredApps } from '@/app/BootRegistryProvider';
import { useUIStore } from '@/store/uiStore';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

/**
 * Mobile navigation drawer (<768px). Desktop and tablet use AppRail + PageNav.
 *
 * The drawer is a full-height column: a fixed header, a nav list that scrolls
 * on its own (every page of every app does not fit on a phone), and a pinned
 * footer holding Settings. Pages are grouped under their app's name, each group
 * wearing that app's accent, so two apps' "Dashboard" can be told apart.
 * Scrim and drawer sit at z-60, above the z-50 chat button.
 */
import { SidebarAppGroup, SidebarHeader, SidebarSettingsLink } from './sidebar/SidebarSections';
import { useSidebarLifecycle } from './sidebar/useSidebarLifecycle';

interface SidebarProps {
  open: boolean;
}

export function Sidebar({ open }: SidebarProps) {
  const { t } = useTranslation('shell');
  const { pathname } = useLocation();
  const registeredApps = useRegisteredApps();
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);
  const close = useCallback(() => setSidebarOpen(false), [setSidebarOpen]);

  useSidebarLifecycle(open, pathname, close);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-overlay-scrim/50 z-60 md:hidden"
        onClick={close}
        aria-hidden="true"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t('mainNavigation')}
        className="fixed inset-y-0 left-0 z-60 flex w-72 max-w-[85vw] flex-col bg-card border-r border-border pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <SidebarHeader onClose={close} />

        <nav
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-4"
          aria-label={t('mainNavigation')}
        >
          {registeredApps.map((app) => (
            <SidebarAppGroup key={app.id} app={app} pathname={pathname} onNavigate={close} />
          ))}
        </nav>

        <SidebarSettingsLink pathname={pathname} onNavigate={close} />
      </aside>
    </>
  );
}
