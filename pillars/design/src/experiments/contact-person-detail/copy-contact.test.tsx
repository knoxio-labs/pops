import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { CopyContact } from './copy-contact';

afterEach(() => vi.unstubAllGlobals());

it('copies only after a click and reports actual success', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  render(<CopyContact value="marina@example.test" />);
  expect(writeText).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Copy contact value' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Copied'));
  expect(writeText).toHaveBeenCalledWith('marina@example.test');
});

it('reports clipboard denial', async () => {
  vi.stubGlobal('navigator', {
    clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) },
  });
  render(<CopyContact value="marina@example.test" />);
  fireEvent.click(screen.getByRole('button', { name: 'Copy contact value' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Copy failed'));
});
