import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FormBanners } from './form-banners';

describe('item form banners', () => {
  it('explains offline saves are disabled', () => {
    render(<FormBanners offline stale={null} saveError={null} justCreated={null} />);

    expect(
      screen.getByText('No connection. Changes are off until it is back.')
    ).toBeInTheDocument();
  });

  it('reloads a stale edit from the banner', () => {
    const reload = vi.fn();
    render(
      <FormBanners
        offline={false}
        stale={{ title: 'Cable changed elsewhere.', groups: [], onReload: reload }}
        saveError={null}
        justCreated={null}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('offers a retry for a refused save', () => {
    const retry = vi.fn();
    render(
      <FormBanners
        offline={false}
        stale={null}
        saveError={{ title: 'Not saved. Try again.', onRetry: retry }}
        justCreated={null}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
