import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { IdeaWorkspace } from './workspace';

describe('place and idea editing', () => {
  it.each(['details', 'route'] as const)(
    'edits a reason in %s and restores it with undo',
    (layout) => {
      render(<IdeaWorkspace layout={layout} />);
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      const original = screen.getByRole('button', { name: 'Edit Reason to go' }).textContent;
      fireEvent.click(screen.getByRole('button', { name: 'Edit Reason to go' }));
      const reason = screen.getByRole('textbox', { name: 'Reason to go' });
      fireEvent.change(reason, { target: { value: 'Meet people while drawing' } });
      fireEvent.blur(reason);
      expect(screen.getByRole('button', { name: 'Edit Reason to go' })).toHaveTextContent(
        'Meet people while drawing'
      );
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      expect(screen.getByRole('button', { name: 'Edit Reason to go' }).textContent).toBe(original);
    }
  );

  it('switches timing precision without borrowing visit dates or losing captured timing', () => {
    render(<IdeaWorkspace layout="route" />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit timing' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Timing precision' }));
    fireEvent.click(screen.getByRole('option', { name: 'Dates' }));
    expect(screen.getByLabelText('From')).toHaveValue('');
    const from = screen.getByLabelText('From');
    fireEvent.change(from, { target: { value: '2028-01-27' } });
    fireEvent.blur(from);
    expect(screen.getByRole('region', { name: 'Idea issues' })).toHaveTextContent(
      'Timing is outside the visit'
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Timing precision' }));
    fireEvent.click(screen.getByRole('option', { name: 'Month' }));
    expect(screen.getByLabelText('Month')).toHaveValue('2028-01');
    expect(screen.queryByRole('region', { name: 'Idea issues' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('combobox', { name: 'Timing precision' }));
    fireEvent.click(screen.getByRole('option', { name: 'Dates' }));
    expect(screen.getByLabelText('From')).toHaveValue('2028-01-27');
  });

  it('retains reason and visit when an arbitrary new city is added, then undoes', () => {
    render(<IdeaWorkspace layout="details" />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit location' }));
    fireEvent.click(screen.getByRole('button', { name: 'New city' }));
    fireEvent.change(screen.getByLabelText('City name'), { target: { value: 'Vitória' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add city' }));
    expect(screen.getByRole('combobox', { name: 'City' })).toHaveTextContent('Vitória');
    expect(screen.getByRole('button', { name: 'Change route placement' })).toHaveTextContent(
      'Belo Horizonte'
    );
    expect(screen.getByRole('region', { name: 'Idea issues' })).toHaveTextContent(
      'Visit is in another city'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('button', { name: 'Edit location' })).toHaveTextContent(
      'Belo Horizonte'
    );
  });

  it('keeps an in-plan idea soft and allows detaching it without losing its source text', () => {
    render(<IdeaWorkspace layout="route" />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Idea status' }));
    fireEvent.click(screen.getByRole('option', { name: 'In plan' }));
    expect(screen.getByRole('article', { name: 'Idea editor' })).toHaveClass('border-dashed');
    fireEvent.click(screen.getByRole('button', { name: 'Change route placement' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unlink visit' }));
    expect(screen.getByRole('button', { name: 'Change route placement' })).toHaveTextContent(
      'Add to visit'
    );
    expect(screen.getByRole('button', { name: 'Edit Name' })).toHaveTextContent(
      'Neighbourhood drawing circle'
    );
    expect(screen.getByRole('button', { name: 'Edit location' })).toHaveTextContent(
      'Belo Horizonte'
    );
  });

  it('keeps unsafe source URLs editable while withholding navigation', () => {
    render(<IdeaWorkspace layout="details" />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit link 1' }));
    const url = screen.getByLabelText('URL · 1');
    fireEvent.change(url, { target: { value: 'javascript:alert(1)' } });
    fireEvent.blur(url);
    expect(screen.getByText('Use an absolute HTTP or HTTPS URL')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open link 1' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('link', { name: 'Open link 1' })).toHaveAttribute(
      'href',
      'https://drawing-circle.example/meetups'
    );
  });

  it('retains recommendation text when its contact is unlinked and restores deleted sources', () => {
    render(<IdeaWorkspace layout="details" />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit recommendation 1' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Recommended by · 1' }));
    fireEvent.click(screen.getByRole('option', { name: 'Without contact' }));
    expect(screen.getByLabelText('Recommendation note · 1')).toHaveValue(
      'Lina mentioned a friendly group that welcomes visitors.'
    );
    fireEvent.keyDown(screen.getByLabelText('Recommendation note · 1'), { key: 'Escape' });
    expect(screen.queryByText('Without contact')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit recommendation 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove recommendation 1' }));
    expect(
      within(screen.getByRole('region', { name: 'Recommendations' })).queryByRole('textbox')
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(
      screen.getByText('Lina mentioned a friendly group that welcomes visitors.')
    ).toBeInTheDocument();
  });

  it('captures an empty idea without selecting a city, visit, dates, recommendations or sources', () => {
    render(<IdeaWorkspace layout="route" scenario="empty" />);
    expect(screen.getByRole('button', { name: 'Edit Name' })).toHaveTextContent('Add name');
    expect(screen.queryByRole('button', { name: /Unlink/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Idea issues' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));
    expect(screen.getByLabelText('URL · 1')).toHaveValue('');
    fireEvent.keyDown(screen.getByLabelText('URL · 1'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Add recommendation' }));
    expect(screen.getByLabelText('Recommendation note · 1')).toHaveValue('');
  });
});

describe('direct text editing', () => {
  it('cancels an edit with Escape and supports keyboard commit without an extra save', () => {
    render(<IdeaWorkspace layout="details" />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Name' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Discarded' } });
    fireEvent.keyDown(screen.getByLabelText('Name'), { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Edit Name' })).toHaveTextContent(
      'Neighbourhood drawing circle'
    );
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Name' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Drawing group' } });
    fireEvent.keyDown(screen.getByLabelText('Name'), { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'Edit Name' })).toHaveTextContent('Drawing group');
  });
});
