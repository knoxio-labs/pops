import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DirectoryWorkspace } from './workspace';

describe('contacts directory proposals', () => {
  it.each(['combined', 'grouped'] as const)(
    'searches aliases and expands details in %s',
    (layout) => {
      render(<DirectoryWorkspace layout={layout} />);
      fireEvent.change(screen.getByRole('textbox', { name: 'Search contacts' }), {
        target: { value: 'Clarinha' },
      });
      const results = screen.getByRole('region', { name: 'Contact results' });
      expect(
        within(results).getByRole('button', { name: 'Details for Clara Silva' })
      ).toBeInTheDocument();
      expect(
        within(results).queryByRole('button', { name: 'Details for Marina Duarte' })
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Details for Clara Silva' }));
      expect(screen.getByRole('region', { name: 'Details for Clara Silva' })).toHaveTextContent(
        'clara@example.test'
      );
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      expect(
        screen.queryByRole('region', { name: 'Details for Clara Silva' })
      ).not.toBeInTheDocument();
    }
  );
  it('creates a distinct contact with explicit type and no inherited facts, then undoes it', () => {
    render(<DirectoryWorkspace layout="combined" scenario="empty" />);
    fireEvent.click(screen.getByRole('button', { name: 'New contact' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Rui Almeida' } });
    expect(screen.getByRole('button', { name: 'Create contact' })).toBeDisabled();
    fireEvent.click(screen.getByRole('combobox', { name: 'New contact type' }));
    fireEvent.click(screen.getByRole('option', { name: /^Person$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create contact' }));
    expect(screen.getByRole('region', { name: 'Details for Rui Almeida' })).toHaveTextContent(
      'Contacts'
    );
    expect(screen.queryByRole('button', { name: 'Copy contact value' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(
      screen.queryByRole('button', { name: 'Details for Rui Almeida' })
    ).not.toBeInTheDocument();
  });
  it('keeps existing finance types visible and combines source and type filters', () => {
    render(<DirectoryWorkspace layout="combined" />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Source' }));
    fireEvent.click(screen.getByRole('option', { name: /^Finance$/ }));
    expect(
      screen.queryByRole('button', { name: 'Details for Clara Silva' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('combobox', { name: 'Type' }));
    fireEvent.click(screen.getByRole('option', { name: /^Bank$/ }));
    expect(screen.getByRole('region', { name: 'Contact results' })).toHaveTextContent('Bank');
    expect(
      screen.queryByRole('button', { name: 'Details for Woolworths' })
    ).not.toBeInTheDocument();
  });
});
