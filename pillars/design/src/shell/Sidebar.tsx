import { Moon, PanelLeftClose, PanelLeftOpen, Palette, Sun } from 'lucide-react';
import { Link, NavLink } from 'react-router';

import { Button, cn } from '@pops/ui';

import { SidebarScreens } from './SidebarScreens';

import type { Catalog } from '../registry';
import type { ThemeMode } from './theme';

function Wordmark() {
  return (
    <Link to="/" className="flex items-baseline gap-1.5 text-foreground hover:opacity-80">
      <span className="text-sm font-bold tracking-tight">POPS</span>
      <span className="text-sm font-medium text-muted-foreground">Design</span>
    </Link>
  );
}

function ContractErrors({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="mt-6 rounded-md border border-destructive/40 bg-destructive/10 p-3">
      <p className="mb-1 text-2xs font-semibold tracking-wider text-destructive uppercase">
        Contract errors
      </p>
      {errors.map((error) => (
        <p key={error} className="mb-1 text-xs break-words">
          {error}
        </p>
      ))}
    </div>
  );
}

interface SidebarProps {
  catalog: Catalog;
  collapsed: boolean;
  onToggle: () => void;
  chromeMode: ThemeMode;
  onToggleChromeMode: () => void;
}

/** The screen tree, the tokens sheet, and the two chrome switches. */
export function Sidebar({
  catalog,
  collapsed,
  onToggle,
  chromeMode,
  onToggleChromeMode,
}: SidebarProps) {
  if (collapsed) {
    return (
      <aside className="flex w-14 shrink-0 flex-col items-center border-r border-border bg-sidebar py-2">
        <Button variant="ghost" size="icon" aria-label="Expand sidebar" onClick={onToggle}>
          <PanelLeftOpen className="size-5" aria-hidden />
        </Button>
      </aside>
    );
  }
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between px-4 py-2">
        <Wordmark />
        <Button variant="ghost" size="icon" aria-label="Collapse sidebar" onClick={onToggle}>
          <PanelLeftClose className="size-5" aria-hidden />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <SidebarScreens catalog={catalog} />
        <ContractErrors errors={catalog.errors} />
      </div>
      <div className="flex items-center justify-between border-t border-border px-3 py-2">
        <NavLink
          to="/tokens"
          className={({ isActive }) =>
            cn(
              'flex min-h-11 items-center gap-2 rounded-md px-2 text-sm',
              isActive
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )
          }
        >
          <Palette className="size-4" aria-hidden /> Tokens
        </NavLink>
        <Button
          variant="ghost"
          size="icon"
          aria-label={chromeMode === 'dark' ? 'Switch chrome to light' : 'Switch chrome to dark'}
          onClick={onToggleChromeMode}
        >
          {chromeMode === 'dark' ? (
            <Sun className="size-4" aria-hidden />
          ) : (
            <Moon className="size-4" aria-hidden />
          )}
        </Button>
      </div>
    </aside>
  );
}
