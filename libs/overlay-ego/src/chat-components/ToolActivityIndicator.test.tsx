import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ToolActivityIndicator, toolLabel } from './ToolActivityIndicator';

describe('ToolActivityIndicator', () => {
  it('renders nothing when there are no tools', () => {
    const { container } = render(<ToolActivityIndicator tools={[]} />);

    expect(container.firstChild).toBeNull();
  });

  it('renders tool labels and accessible statuses in order in a polite live region', () => {
    render(
      <ToolActivityIndicator
        tools={[
          { name: 'finance_transactions_list', status: 'started' },
          { name: 'finance.transactions.list', status: 'finished' },
          { name: 'ego-show-entities', status: 'failed' },
        ]}
      />
    );

    const list = screen.getByRole('list');
    expect(list.parentElement).toHaveAttribute('aria-live', 'polite');

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('running');
    expect(rows[0]).toHaveTextContent('finance transactions list');
    expect(rows[1]).toHaveTextContent('done');
    expect(rows[1]).toHaveTextContent('finance transactions list');
    expect(rows[2]).toHaveTextContent('failed');
    expect(rows[2]).toHaveTextContent('ego show entities');
  });

  it('replaces periods, underscores, and hyphens in tool names', () => {
    expect(toolLabel('finance_transactions_list')).toBe('finance transactions list');
    expect(toolLabel('finance.transactions.list')).toBe('finance transactions list');
    expect(toolLabel('ego-show-entities')).toBe('ego show entities');
  });
});
