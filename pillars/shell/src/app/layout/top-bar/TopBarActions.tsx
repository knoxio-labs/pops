import { useThemeStore } from '@/store/themeStore';
import { Moon, Search, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

import { LocaleSwitcher } from './LocaleSwitcher';
import { TopBarWidgets } from './TopBarWidgets';

interface TopBarActionsProps {
  onOpenMobileSearch: () => void;
  /** Opens an app-owned compact search surface when one is registered. */
  onOpenCompactSearch?: () => void;
}

/** Renders TopBar controls and selects the compact or mobile search opener. */
export function TopBarActions({ onOpenMobileSearch, onOpenCompactSearch }: TopBarActionsProps) {
  const { t } = useTranslation('shell');
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  return (
    <div className="ml-auto flex items-center gap-1 md:gap-4">
      <Button
        variant="ghost"
        size="icon"
        onClick={onOpenCompactSearch ?? onOpenMobileSearch}
        className={`min-w-[44px] min-h-[44px] ${onOpenCompactSearch === undefined ? 'md:hidden' : 'lg:hidden'}`}
        aria-label={t('openSearch')}
        data-testid="mobile-search-btn"
      >
        <Search className="h-5 w-5" />
      </Button>

      <TopBarWidgets />

      <LocaleSwitcher />

      <Button
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        className="min-w-[44px] min-h-[44px] transition-colors group"
        aria-label={t('toggleTheme')}
      >
        {theme === 'dark' ? (
          <Sun className="h-5 w-5 text-warning group-hover:text-warning/80 transition-colors" />
        ) : (
          <Moon className="h-5 w-5 text-info group-hover:text-info/80 transition-colors" />
        )}
      </Button>
    </div>
  );
}
