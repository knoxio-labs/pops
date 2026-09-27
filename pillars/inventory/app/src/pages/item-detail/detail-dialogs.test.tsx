import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { coreItem, coreWorld } from '../../foundation/test-fixtures/core';
import { DetailDialogs } from './detail-dialogs';

describe('DetailDialogs', () => {
  it('returns a lifecycle reason instead of only the dialog id', () => {
    const onDone = vi.fn();
    render(
      <DetailDialogs
        item={coreItem('itm-drill')}
        world={coreWorld}
        open="discard"
        onClose={() => undefined}
        onDone={onDone}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Broken' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard Cordless drill' }));

    expect(onDone).toHaveBeenCalledWith({ dialog: 'discard', reason: 'Broken' });
  });

  it('returns the selected restore destination for a lost item', () => {
    const onDone = vi.fn();
    render(
      <DetailDialogs
        item={coreItem('itm-umbrella')}
        world={coreWorld}
        open="restore"
        onClose={() => undefined}
        onDone={onDone}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Found it' }));

    expect(onDone).toHaveBeenCalledWith({ dialog: 'restore', where: 'in-hand' });
  });

  it('passes the valid split count and does not pass the display name', () => {
    const onDone = vi.fn();
    render(
      <DetailDialogs
        item={coreItem('itm-hdmi')}
        world={coreWorld}
        open="split"
        onClose={() => undefined}
        onDone={onDone}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Split off 1' }));

    expect(onDone).toHaveBeenCalledWith({ dialog: 'split', count: 1 });
  });
});
