import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DecisionWorkspace } from './workspace';

describe('decision workspace', () => {
  it.each(['options', 'impact'] as const)(
    'chooses, changes, reopens and undoes in %s',
    (layout) => {
      render(<DecisionWorkspace layout={layout} />);
      fireEvent.click(screen.getByRole('button', { name: 'Choose Stay in the Northeast' }));
      expect(
        within(screen.getByRole('region', { name: 'Decision' })).getByText('Decided')
      ).toBeInTheDocument();
      expect(
        within(screen.getByRole('article', { name: 'Option 1' })).getByText('Selected')
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Choose Head inland to Minas Gerais' }));
      expect(
        within(screen.getByRole('article', { name: 'Option 2' })).getByText('Selected')
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
      expect(screen.queryByText('Selected')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      expect(
        within(screen.getByRole('article', { name: 'Option 2' })).getByText('Selected')
      ).toBeInTheDocument();
      expect(screen.getAllByRole('article')).toHaveLength(3);
    }
  );

  it('captures an arbitrary option without requiring a deadline or a linked plan', () => {
    render(<DecisionWorkspace layout="options" scenario="empty" />);
    fireEvent.click(screen.getByRole('button', { name: 'Add option' }));
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Option name'), {
      target: { value: 'Visit a friend in Vitória' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose Visit a friend in Vitória' }));
    expect(screen.getByText('Selected')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Decision issues' })).not.toBeInTheDocument();
  });

  it('links sources and undoes without changing option text', () => {
    render(<DecisionWorkspace layout="options" />);
    fireEvent.click(screen.getByRole('button', { name: 'Link plans to option 2' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Olinda' }));
    expect(
      within(screen.getByRole('article', { name: 'Option 2' })).getByText('Olinda')
    ).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(
      within(screen.getByRole('article', { name: 'Option 2' })).queryByText('Olinda')
    ).not.toBeInTheDocument();
  });

  it('removes a selected option and restores its selection with undo', () => {
    render(<DecisionWorkspace layout="options" scenario="selected" />);
    fireEvent.click(screen.getByRole('button', { name: 'Option 2 actions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove option' }));
    expect(screen.queryByText('Selected')).not.toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByText('Selected')).toBeInTheDocument();
  });

  it('preserves readable content and cancels direct editing', () => {
    render(<DecisionWorkspace layout="options" />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    const original = screen.getByRole('button', { name: 'Edit Question' }).textContent;
    fireEvent.click(screen.getByRole('button', { name: 'Edit Question' }));
    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Discard me' } });
    fireEvent.keyDown(screen.getByLabelText('Question'), { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Edit Question' }).textContent).toBe(original);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  it('shows unavailable references and lets the user reopen a broken selection', () => {
    render(<DecisionWorkspace layout="impact" scenario="missing-reference" />);
    expect(screen.getByRole('region', { name: 'Decision issues' })).toHaveTextContent(
      'Selected option unavailable'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    expect(screen.queryByText('Selected option unavailable')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Decision issues' })).toHaveTextContent(
      'Linked arrangement unavailable'
    );
  });
});
