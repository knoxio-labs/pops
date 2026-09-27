import { fireEvent, render, screen } from '@testing-library/react';
import { Cable, History } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { SectionStack } from './section-stack.js';

describe('SectionStack', () => {
  it('keeps one detail section open and exposes folded summaries', () => {
    render(
      <SectionStack
        initialOpen="connections"
        sections={[
          {
            id: 'connections',
            title: 'Connections',
            icon: Cable,
            count: 2,
            summary: '2 connections',
            flagged: false,
            body: <p>Connection body</p>,
          },
          {
            id: 'history',
            title: 'History',
            icon: History,
            count: 4,
            summary: '4 events',
            flagged: true,
            body: <p>History body</p>,
          },
        ]}
      />
    );

    expect(screen.getByRole('button', { name: /Connections/u })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByText('Connection body')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /History/u })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.getByLabelText('Needs a look')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /History/u }));

    expect(screen.getByRole('button', { name: /Connections/u })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.getByRole('button', { name: /History/u })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByText('History body')).toBeInTheDocument();
    expect(screen.queryByText('Connection body')).not.toBeInTheDocument();
  });
});
