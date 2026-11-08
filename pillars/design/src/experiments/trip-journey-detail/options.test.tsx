import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { JourneyWorkspace } from './workspace';

describe('journey alternatives', () => {
  it('edits an alternative independently, selects it, retains purchases and undoes selection', () => {
    render(<JourneyWorkspace layout="legs" />);
    const options = within(screen.getByRole('region', { name: 'Journey alternatives' }));
    fireEvent.click(options.getByRole('button', { name: 'Edit option' }));
    const editor = within(options.getByRole('region', { name: 'Edit alternative journey' }));
    const departure = editor.getByLabelText('Departure time · leg 1');
    fireEvent.change(departure, { target: { value: '2028-01-18T12:00' } });
    fireEvent.blur(departure);
    expect(screen.getAllByLabelText('Departure time · leg 1')[0]).toHaveValue('2028-01-15T10:00');
    fireEvent.click(options.getByRole('button', { name: 'Use journey' }));
    expect(screen.getByLabelText('Departure time · leg 1')).toHaveValue('2028-01-18T12:00');
    expect(options.getByRole('article', { name: 'Alternative 1' })).toHaveTextContent(
      '2 purchased legs'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByLabelText('Departure time · leg 1')).toHaveValue('2028-01-15T10:00');
    expect(screen.getByRole('article', { name: 'leg 1' })).toHaveTextContent('Purchased');
  });

  it('adds a blank option and captures a soft leg without changing the current journey', () => {
    render(<JourneyWorkspace layout="legs" />);
    const options = within(screen.getByRole('region', { name: 'Journey alternatives' }));
    fireEvent.click(options.getByRole('button', { name: 'Add option' }));
    const editor = within(options.getByRole('region', { name: 'Edit alternative journey' }));
    expect(editor.queryByRole('article')).not.toBeInTheDocument();
    expect(editor.queryByRole('button', { name: /Unlink/ })).not.toBeInTheDocument();
    fireEvent.click(editor.getByRole('button', { name: 'Add transport' }));
    fireEvent.click(screen.getByRole('button', { name: 'Train' }));
    expect(editor.getByRole('article', { name: 'leg 1' })).toHaveTextContent('Considering');
    expect(screen.getAllByLabelText('Departure time · leg 1')[0]).toHaveValue('2028-01-15T10:00');
  });
});
