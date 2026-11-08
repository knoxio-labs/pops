import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DirectoryWorkspace } from './workspace';

afterEach(() => vi.unstubAllGlobals());

describe('expanded directory contact facts', () => {
  it('groups source facts and identifies each copy action by its field', async () => {
    const writeText = vi.fn<(value: string) => Promise<void>>().mockResolvedValue();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<DirectoryWorkspace layout="combined" />);
    const details = screen.getByRole('region', { name: 'Details for Marina Duarte' });
    const methods = within(details).getByRole('region', { name: 'Contact methods' });
    expect(methods).toHaveTextContent('marina@example.test');
    expect(methods).toHaveTextContent('marina@studio.example.test');
    expect(within(details).getByRole('region', { name: 'Home address' })).toHaveTextContent(
      'Rua das Flores, 18'
    );
    expect(within(details).getByRole('region', { name: 'Contact notes' })).toHaveTextContent(
      'Met through Clara.'
    );
    fireEvent.click(
      within(methods).getByRole('button', { name: 'Copy Personal: marina@example.test' })
    );
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Copied'));
    expect(writeText).toHaveBeenCalledExactlyOnceWith('marina@example.test');
    expect(
      within(details).queryByRole('button', { name: 'Copy contact value' })
    ).not.toBeInTheDocument();
  });

  it('keeps a sparse identity free of invented contact sections or values', () => {
    render(<DirectoryWorkspace layout="combined" scenario="sparse" />);
    const details = screen.getByRole('region', { name: 'Details for Rui Almeida' });
    expect(
      within(details).queryByRole('region', { name: 'Contact methods' })
    ).not.toBeInTheDocument();
    expect(
      within(details).queryByRole('region', { name: 'Contact notes' })
    ).not.toBeInTheDocument();
    expect(within(details).queryByRole('region', { name: /address/ })).not.toBeInTheDocument();
    expect(details).toHaveTextContent('Source · Contacts');
  });
});
