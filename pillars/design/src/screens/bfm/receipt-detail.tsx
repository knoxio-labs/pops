import { PopsActionBar, PopsButton, PopsCard, PopsRow, StateView } from '@/frames/ios/primitives';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Receipt detail', order: 1 };

const LINES = [
  { title: 'Oat milk, 1L', subtitle: '2 × €1.79', amount: '€3.58' },
  { title: 'Sourdough', subtitle: 'Bakery', amount: '€4.20' },
  { title: 'Coffee beans, 500g', subtitle: 'Ground in store', amount: '€11.90' },
];

/**
 * An iOS screen built from the facsimile primitives, to be reviewed inside the
 * iPhone frame. Switch the dock's frame axis to **iPhone**.
 */
export default function ReceiptDetail() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 p-4">
        <header className="space-y-1">
          <h1 className="ios-large-title">Continente</h1>
          <p className="ios-subheadline" style={{ color: 'var(--ios-muted-foreground)' }}>
            2 September · 14:08
          </p>
        </header>
        <p className="ios-amount">€19.68</p>
        <PopsCard>
          <div className="space-y-3">
            <span className="ios-section-label" style={{ color: 'var(--ios-muted-foreground)' }}>
              ITEMS
            </span>
            {LINES.map((line) => (
              <PopsRow
                key={line.title}
                title={line.title}
                subtitle={line.subtitle}
                trailing={<span className="ios-monospaced">{line.amount}</span>}
              />
            ))}
          </div>
        </PopsCard>
      </div>
      <PopsActionBar>
        <PopsButton>Edit</PopsButton>
        <PopsButton prominence="prominent">Attach to order</PopsButton>
      </PopsActionBar>
    </div>
  );
}

export const states: ScreenStates = {
  loading: () => <StateView message="Reading the receipt…" />,
  empty: () => (
    <StateView
      message="No lines were read from this receipt."
      accessory={<PopsButton>Enter them by hand</PopsButton>}
    />
  ),
  error: () => (
    <StateView
      message="The receipt could not be read."
      tone="destructive"
      accessory={<PopsButton prominence="prominent">Try again</PopsButton>}
    />
  ),
};
