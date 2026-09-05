import { purchases } from '@/fixtures/purchases';
import { PopsButton, PopsCard } from '@/frames/ios/primitives';
import { ErrorStateView } from '@/frames/ios/state-views';
import { IOS_TABS } from '@/frames/ios/TabBar';
import { PurchasesList } from '@/screens/mobile/purchases';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'App shell', order: 12, frame: 'ios' };

const DEGRADED = 'Some of Pops could not be reached, so this may be out of date.';

/**
 * A bar the content is not pushed down by. Bootstrap failing does not make
 * the app unusable — every screen under this still draws whatever it last
 * knew — so the banner floats over the surface rather than becoming another
 * row of chrome the reader has to scroll past on every launch.
 */
function DegradedBanner({ retry }: { retry: boolean }) {
  return (
    <div className="p-4 pb-0">
      <PopsCard>
        <div className="space-y-3">
          <p className="ios-body" style={{ color: 'var(--ios-muted-foreground)' }}>
            {DEGRADED}
          </p>
          {retry ? <PopsButton>Try again</PopsButton> : null}
        </div>
      </PopsCard>
    </div>
  );
}

function TabBarPreview({ count }: { count: number }) {
  if (count < 2) return null;
  return (
    <div
      className="flex items-stretch justify-around rounded-xl"
      style={{ background: 'var(--ios-surface)', border: '1px solid var(--ios-separator)' }}
    >
      {IOS_TABS.slice(0, count).map((tab, index) => {
        const Icon = tab.icon;
        return (
          <div
            key={tab.slug}
            className="flex flex-1 flex-col items-center gap-0.5 py-2"
            style={{
              color: index === 0 ? 'var(--ios-accent)' : 'var(--ios-muted-foreground)',
            }}
          >
            <Icon size={22} />
            <span className="ios-caption">{tab.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * How many tabs a paired phone actually gets, which is a server's answer and
 * not a design's: the app draws a tab per feature the server says is usable,
 * and none at all below two — a one-tab tab bar is chrome that says nothing.
 * Worth reviewing here because a design drawn against four tabs has to
 * survive being shown with one.
 */
function TabCounts() {
  return (
    <div className="space-y-6 p-4">
      <header className="space-y-2">
        <h1 className="ios-title">What the server offered</h1>
        <p className="ios-subheadline" style={{ color: 'var(--ios-muted-foreground)' }}>
          One tab per usable feature, in the order the server named them. Below two, the feature
          fills the screen and there is no bar at all.
        </p>
      </header>
      {[4, 3, 2, 1].map((count) => (
        <section key={count} className="space-y-2">
          <p className="ios-section-label" style={{ color: 'var(--ios-muted-foreground)' }}>
            {count === 1 ? 'One feature — no bar' : `${count} features`}
          </p>
          <TabBarPreview count={count} />
          {count === 1 ? (
            <p className="ios-caption" style={{ color: 'var(--ios-muted-foreground)' }}>
              The feature fills the content area.
            </p>
          ) : null}
        </section>
      ))}
    </div>
  );
}

/**
 * The app's root: a blank ground while the keychain is read, the pairing
 * screen when there is no device, and the feature area when there is. Only
 * the third has anything of its own to draw — a bootstrap that failed or
 * answered from a stale registry, and the tab bar the answer sizes.
 *
 * `launching` is deliberately featureless. It is on screen for as long as a
 * `UserDefaults` read takes, and a logo or a spinner there is a splash screen
 * that will one day be seen for a whole second because something behind it
 * got slow.
 */
export function AppShell({ degraded, retry = false }: { degraded?: boolean; retry?: boolean }) {
  return (
    <div className="h-full">
      {degraded === true ? <DegradedBanner retry={retry} /> : null}
      <PurchasesList rows={purchases} />
    </div>
  );
}

export const states: ScreenStates = {
  launching: () => <div className="h-full" style={{ background: 'var(--ios-background)' }} />,
  'degraded-stale': () => <AppShell degraded />,
  'degraded-failed': () => <AppShell degraded retry />,
  'nothing-offered': () => (
    <ErrorStateView
      message="Your Pops server is not offering anything this app can show yet."
      retryTitle="Try again"
    />
  ),
  'nothing-usable': () => (
    <ErrorStateView
      message="Transactions needs a newer version of this app. purchases is not available right now."
      retryTitle="Try again"
    />
  ),
  'tab-counts': () => <TabCounts />,
};

export default function AppShellScreen() {
  return <AppShell />;
}
