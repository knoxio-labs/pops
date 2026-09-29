import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ReloadRequired, SessionExpired } from './interruptions';

describe('ReloadRequired', () => {
  it('is an alert and Reload calls onReload', () => {
    const onReload = vi.fn();
    render(<ReloadRequired onReload={onReload} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Inventory was updated. Reload to keep making changes.'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));

    expect(onReload).toHaveBeenCalledOnce();
  });
});

describe('SessionExpired', () => {
  it('is a labelled alertdialog and Sign in calls onSignIn', () => {
    const onSignIn = vi.fn();
    render(<SessionExpired onSignIn={onSignIn} />);

    expect(screen.getByRole('alertdialog', { name: 'Signed out' })).toHaveTextContent(
      'Your session ended. Sign in again and this page stays as it is. Every change up to now was saved.'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(onSignIn).toHaveBeenCalledOnce();
  });
});
