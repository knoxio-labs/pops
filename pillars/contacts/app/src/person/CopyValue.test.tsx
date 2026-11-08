import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { CopyValue } from './CopyValue';

it('copies the exact value without normalization or label text', async () => {
  const user = userEvent.setup();
  const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  render(<CopyValue value="Marina@Example.test" />);
  await user.click(screen.getByRole('button', { name: 'Copy value' }));
  expect(write).toHaveBeenCalledExactlyOnceWith('Marina@Example.test');
  expect(await screen.findByRole('status')).toHaveTextContent('Copied');
});

it('retains a reportable clipboard failure and allows retry', async () => {
  const user = userEvent.setup();
  const write = vi
    .spyOn(navigator.clipboard, 'writeText')
    .mockRejectedValueOnce(new Error('private platform details'))
    .mockResolvedValue();
  render(<CopyValue value="0412 555 018" />);
  await user.click(screen.getByRole('button', { name: 'Copy value' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('contacts.clipboard');
  expect(screen.queryByText(/private platform details/)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Copy value' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Copied');
  expect(write).toHaveBeenCalledTimes(2);
});
