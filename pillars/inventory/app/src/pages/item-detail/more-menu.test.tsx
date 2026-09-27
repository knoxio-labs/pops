import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { INVENTORY_ICONS } from '../../foundation/model';
import { MoreMenu } from './more-menu';

describe('MoreMenu', () => {
  it('keeps groups separated, renders refusal reasons, and sends allowed selections', () => {
    const onSelect = vi.fn();
    render(
      <MoreMenu
        defaultOpen
        groups={[
          [
            { id: 'copy-link', label: 'Copy link', icon: INVENTORY_ICONS.history },
            {
              id: 'copy-code',
              label: 'Copy code',
              icon: INVENTORY_ICONS.code,
              disabledReason: 'No code yet.',
            },
          ],
          [
            {
              id: 'destroy',
              label: 'Destroy',
              icon: INVENTORY_ICONS.destroyed,
              destructive: true,
            },
          ],
        ]}
        onSelect={onSelect}
      />
    );

    expect(screen.getAllByRole('separator')).toHaveLength(1);
    expect(screen.getByText('No code yet.')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Copy codeNo code yet\./u })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByRole('menuitem', { name: 'Destroy' })).toHaveClass('text-destructive');

    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'copy-link' }));
  });
});
