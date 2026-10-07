import { GUEST_EMAIL, OPERATOR_EMAIL } from '@/fixtures/sharing';
import { WEB_APPS } from '@/frames/web/apps';
import { PageNav } from '@/frames/web/PageNav';
import { Lock, Menu, Smartphone, TriangleAlert, X } from 'lucide-react';

import { iconMap } from '@pops/navigation';
import { Button, cn, EmptyState, Skeleton } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { ReactNode } from 'react';

/**
 * The shell as a guest gets it. It draws its own chrome rather than sitting in
 * the POPS web frame, because that frame is the operator's: every app on the
 * rail, Settings at its foot. A guest's rail holds finance alone, the page nav
 * holds the two pages a guest may open, and Pair iPhone takes the foot of the
 * rail where Settings would be.
 */
export const meta: ScreenMeta = { title: 'Guest shell', order: 1, frame: 'none' };

export type GuestPage = 'accounts' | 'transactions' | 'pair';

const GUEST_PATHS = new Set(['/accounts', '/transactions']);
const finance = WEB_APPS.find((app) => app.id === 'finance');
const guestFinance = finance
  ? { ...finance, items: finance.items.filter((item) => GUEST_PATHS.has(item.path)) }
  : undefined;

function TopBar({ menuOpen, signedIn }: { menuOpen: boolean; signedIn: boolean }) {
  const MenuIcon = menuOpen ? X : Menu;
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-3 md:h-16 md:px-4">
      <span
        className="inline-flex size-11 items-center justify-center rounded-lg text-foreground/70 md:hidden"
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        role="img"
      >
        <MenuIcon className="size-5" aria-hidden />
      </span>
      <span className="bg-gradient-to-br from-brand-gradient-from via-brand-gradient-via to-brand-gradient-to bg-clip-text text-xl font-black tracking-tighter text-transparent md:text-2xl">
        POPS
      </span>
      {signedIn && (
        <span className="ml-auto min-w-0 text-right">
          <span className="block text-2xs text-muted-foreground uppercase">Signed in as</span>
          <span className="block truncate text-xs font-medium">{GUEST_EMAIL}</span>
        </span>
      )}
    </header>
  );
}

function Rail({ active }: { active?: GuestPage }) {
  const Icon = finance ? iconMap[finance.icon] : undefined;
  const pairing = active === 'pair';
  return (
    <div className="hidden w-16 shrink-0 flex-col gap-2 border-r border-border bg-card py-2 md:flex">
      {Icon && (
        <span
          className={cn(
            'mx-auto inline-flex size-11 items-center justify-center rounded-xl',
            pairing ? 'text-foreground/60' : 'bg-app-accent/15 text-app-accent'
          )}
          title="Finance"
        >
          <Icon className="size-5" aria-hidden />
        </span>
      )}
      <span
        className={cn(
          'mx-auto mt-auto inline-flex size-12 items-center justify-center rounded-xl',
          pairing ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground'
        )}
        title="Pair iPhone"
        aria-label="Pair iPhone"
        role="img"
      >
        <Smartphone className="size-6" aria-hidden />
      </span>
    </div>
  );
}

const MENU: { page: GuestPage; label: string }[] = [
  { page: 'accounts', label: 'Accounts' },
  { page: 'transactions', label: 'Transactions' },
  { page: 'pair', label: 'Pair iPhone' },
];

/** Below 768 there is no rail, so the same three destinations open from the top bar. */
function PhoneMenu({ active }: { active?: GuestPage }) {
  return (
    <div className="absolute inset-0 z-10 bg-background/80 md:hidden">
      <nav className="h-full w-64 space-y-1 border-r border-border bg-card p-2" aria-label="Pages">
        {MENU.map(({ page, label }) => (
          <span
            key={page}
            className={cn(
              'block rounded-lg px-3 py-2.5 text-sm font-medium',
              page === active ? 'bg-app-accent text-app-accent-foreground' : 'text-foreground/80'
            )}
          >
            {label}
          </span>
        ))}
      </nav>
    </div>
  );
}

/**
 * The guest chrome around a page. The frame is exactly one screen tall and
 * never scrolls: a page that holds a list gives the list the leftover height.
 */
export function GuestChrome({
  active,
  menuOpen = false,
  signedIn = true,
  children,
}: {
  active?: GuestPage;
  menuOpen?: boolean;
  /** False only while the session itself could not be read, when there is no email to show. */
  signedIn?: boolean;
  children: ReactNode;
}) {
  const accent = finance?.color ? `app-${finance.color}` : undefined;
  return (
    <div className={cn('flex h-screen flex-col bg-background', accent)}>
      <TopBar menuOpen={menuOpen} signedIn={signedIn} />
      <div className="relative flex min-h-0 flex-1">
        <Rail active={active} />
        {guestFinance && active !== 'pair' && (
          <PageNav app={guestFinance} activePath={active ? `/${active}` : undefined} />
        )}
        {menuOpen && <PhoneMenu active={active} />}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * One page for every route a guest may not open, whether it exists or not:
 * telling them apart would say which parts of POPS are there to be asked for.
 */
export function RouteNotAllowed() {
  return (
    <EmptyState
      className="m-auto"
      icon={Lock}
      title="This page is not shared with you"
      description={`${OPERATOR_EMAIL} shares finance accounts with ${GUEST_EMAIL}. The rest of POPS stays private.`}
      action={<Button>Go to your accounts</Button>}
    />
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>
  );
}

export const states: ScreenStates = {
  loading: () => (
    <GuestChrome active="accounts">
      <PageSkeleton />
    </GuestChrome>
  ),
  'phone-menu': () => (
    <GuestChrome active="accounts" menuOpen>
      <PageSkeleton />
    </GuestChrome>
  ),
  'session-error': () => (
    <GuestChrome signedIn={false}>
      <EmptyState
        className="m-auto"
        icon={TriangleAlert}
        title="Could not confirm who you are"
        description="POPS did not get an answer about your sign-in. Nothing was lost; try again in a moment."
        action={<Button variant="outline">Try again</Button>}
      />
    </GuestChrome>
  ),
};

export default function GuestShellScreen() {
  return (
    <GuestChrome>
      <RouteNotAllowed />
    </GuestChrome>
  );
}
