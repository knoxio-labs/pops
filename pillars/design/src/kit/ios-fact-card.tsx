import { formatBalance } from '@/fixtures/currencies';
import { PopsCard } from '@/frames/ios/primitives';

import type { ReactNode } from 'react';

const MS_PER_DAY = 86_400_000;

/** A titled card of one kind's facts. The phone's answer to a dashboard module. */
export function FactCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <PopsCard>
      <div className="space-y-3">
        <span
          className="ios-section-label tracking-wide uppercase"
          style={{ color: 'var(--ios-muted-foreground)' }}
        >
          {title}
        </span>
        {children}
      </div>
    </PopsCard>
  );
}

export function money(minorUnits: number, currency: string): string {
  return formatBalance(minorUnits, currency);
}

export function daysUntil(iso: string): number {
  return Math.round((new Date(`${iso}T00:00:00`).getTime() - Date.now()) / MS_PER_DAY);
}

export function countdown(days: number): string {
  if (days < 0) return `${Math.abs(days)} days ago`;
  return days === 0 ? 'today' : `in ${days} days`;
}

export function monthLabel(month: string): string {
  const date = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1);
  return date.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="ios-caption" style={{ color: 'var(--ios-muted-foreground)' }}>
      {children}
    </p>
  );
}
