import { matchesAtBoundary } from '@/app/nav/path-utils';
import { Settings, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { Button, cn } from '@pops/ui';

import { BuildVersion } from '../BuildVersion';
import { SidebarNavLink } from './SidebarNavLink';

import type { AppNavConfig } from '@/app/nav/registry';

export function SidebarHeader({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('shell');

  return (
    <div className="flex shrink-0 items-center justify-between px-4 py-2 border-b border-border">
      <div className="flex items-baseline gap-1.5">
        <span className="text-lg font-bold">POPS</span>
        <BuildVersion />
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onClose}
        className="min-w-[44px] min-h-[44px]"
        aria-label={t('closeSidebar')}
      >
        <X className="h-5 w-5" />
      </Button>
    </div>
  );
}

interface SidebarAppGroupProps {
  app: AppNavConfig;
  pathname: string;
  onNavigate: () => void;
}

/** One app's pages under its name, in its own accent. */
export function SidebarAppGroup({ app, pathname, onNavigate }: SidebarAppGroupProps) {
  const { t } = useTranslation('navigation');
  const headingId = `sidebar-app-${app.id}`;

  return (
    <section
      className={cn('space-y-1', app.color && `app-${app.color}`)}
      aria-labelledby={headingId}
    >
      <p
        id={headingId}
        className="px-4 pt-1 text-2xs font-bold uppercase tracking-label text-app-accent"
      >
        {t(app.labelKey)}
      </p>
      {app.items.map((item) => (
        <SidebarNavLink
          key={`${app.basePath}${item.path}`}
          app={app}
          item={item}
          pathname={pathname}
          onNavigate={onNavigate}
        />
      ))}
    </section>
  );
}

interface SidebarSettingsLinkProps {
  pathname: string;
  onNavigate: () => void;
}

/** Settings — the rail carries it at md+, and nothing else reaches it on a phone. */
export function SidebarSettingsLink({ pathname, onNavigate }: SidebarSettingsLinkProps) {
  const { t } = useTranslation('shell');
  const active = matchesAtBoundary(pathname, '/settings');

  return (
    <div className="shrink-0 border-t border-border p-3">
      <Link
        to="/settings"
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors font-medium min-h-[44px]',
          active ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted'
        )}
      >
        <Settings className="h-5 w-5 shrink-0" />
        <span>{t('settings')}</span>
      </Link>
    </div>
  );
}
