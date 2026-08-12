import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import enAUPurchases from '@pops/locales/en-AU/purchases.json';

import { ReconcileQueuePage } from '../ReconcileQueuePage';

describe('ReconcileQueuePage', () => {
  it('renders the page heading', () => {
    render(<ReconcileQueuePage />);
    expect(screen.getByRole('heading', { name: enAUPurchases['reconcile.title'] })).toBeVisible();
  });

  // Every string on this page comes from the catalog. Asserting against the
  // catalog values rather than literals means a key missing from the bundle
  // fails here — i18next falls back to echoing the raw key, which renders as
  // `reconcile.title` and would otherwise pass a literal-free smoke test.
  it('resolves its copy from the catalog rather than rendering raw keys', () => {
    render(<ReconcileQueuePage />);
    for (const copy of Object.values(enAUPurchases)) {
      expect(screen.getByText(copy)).toBeVisible();
    }
  });

  it('stands in for the queue instead of rendering sample rows', () => {
    render(<ReconcileQueuePage />);
    expect(screen.queryByRole('table')).toBeNull();
  });
});
