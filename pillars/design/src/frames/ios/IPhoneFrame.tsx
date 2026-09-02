import './tokens.css';
import './type-scale.css';
import './frame.css';

import type { ReactNode } from 'react';

function StatusBar() {
  return (
    <div
      className="ios-status-bar ios-caption absolute inset-x-0 top-0 z-10 flex items-end justify-between px-9 pb-2 font-semibold"
      aria-hidden
    >
      <span>9:41</span>
      <span className="tracking-widest">▪▪▪ ᯤ ▮</span>
    </div>
  );
}

function HomeIndicator() {
  return (
    <div
      className="ios-home-indicator absolute inset-x-0 bottom-0 z-10 flex items-center justify-center"
      aria-hidden
    >
      <span
        className="h-[5px] w-[140px] rounded-full opacity-40"
        style={{ background: 'var(--ios-foreground)' }}
      />
    </div>
  );
}

/**
 * An iPhone at 393×852 logical points: bezel, status bar, home indicator, and
 * the safe-area variables a screen inside it can read
 * (`--ios-safe-area-inset-top` / `-bottom`).
 *
 * A facsimile, not a simulator. It gets the frame, the colours (generated from
 * the app's own asset catalogue) and the type scale right; it does not model
 * Dynamic Type, the keyboard, scroll physics, or anything a UIKit view does at
 * runtime. Native fidelity is deliberately out of scope — rasterising real
 * SwiftUI screens beside this is POPS-2784.
 */
export function IPhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="ios-frame flex min-h-screen items-center justify-center p-6"
      style={{ background: 'var(--ios-surface)' }}
    >
      <div
        className="relative overflow-hidden rounded-[54px] p-3 shadow-2xl"
        style={{ background: 'var(--ios-foreground)' }}
      >
        <div className="ios-device relative overflow-hidden rounded-[42px]">
          <StatusBar />
          <div className="ios-device-content ios-body">{children}</div>
          <HomeIndicator />
        </div>
      </div>
    </div>
  );
}
