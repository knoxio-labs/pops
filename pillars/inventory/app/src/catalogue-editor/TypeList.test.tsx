import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { testType } from './type-tree-test-utils';
import { TypeList } from './TypeList';

const types = [
  testType('bedding', 'Bedding', null),
  testType('pillows', 'Pillows', 'bedding'),
  testType('pillowcase', 'Pillowcase', 'pillows'),
  testType('sheet', 'Sheet', 'bedding', { archivedAt: '2026-09-26T00:00:00.000Z' }),
];

function renderList() {
  return render(<TypeList types={types} selectedId={null} onCreate={vi.fn()} onSelect={vi.fn()} />);
}

describe('TypeList', () => {
  it('renders a type tree with indentation and dimmed archived entries', () => {
    renderList();

    expect(screen.getByRole('button', { name: /Bedding/u })).toHaveClass('pl-3');
    expect(screen.getByRole('button', { name: /Pillows/u })).toHaveClass('pl-8');
    expect(screen.getByRole('button', { name: /Pillowcase/u })).toHaveClass('pl-12');
    expect(screen.queryByRole('button', { name: /Sheet/u })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Show archived/u }));

    expect(screen.getByRole('button', { name: /Sheet/u })).toHaveClass('opacity-60');
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('keeps matching ancestors visible when searching for a child', () => {
    renderList();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search item types' }), {
      target: { value: 'pillowcase' },
    });

    expect(screen.getByRole('button', { name: /Bedding/u })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pillows/u })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pillowcase/u })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sheet/u })).not.toBeInTheDocument();
  });
});
