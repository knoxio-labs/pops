import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InboxWorkspace } from './workspace';

const note = 'Ask Clara about a walk along the waterfront.';

describe('Inbox source reference boundaries', () => {
  it('keeps a broken target unorganised and removes its association without deleting the source', () => {
    render(<InboxWorkspace layout="inline" scenario="missing-reference" />);
    const trigger = screen.getByRole('button', { name: `Open ${note}` });
    expect(trigger).toHaveTextContent('To organise');
    fireEvent.click(trigger);
    expect(screen.getByRole('alert')).toHaveTextContent('The linked item is unavailable.');
    fireEvent.click(screen.getByRole('button', { name: 'Unlink Item unavailable' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Raw source' })).toHaveTextContent(note);
    expect(screen.queryByRole('region', { name: 'Linked trip items' })).not.toBeInTheDocument();
  });

  it('shows a missing original without substituting a source or offering creation', () => {
    render(<InboxWorkspace layout="dialog" scenario="missing-reference" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Source unavailable' }));
    const source = screen.getByRole('dialog');
    expect(source).toHaveTextContent('The captured source is unavailable.');
    expect(within(source).queryByRole('region', { name: 'Raw source' })).not.toBeInTheDocument();
    expect(within(source).queryByRole('button', { name: 'New item' })).not.toBeInTheDocument();
    expect(
      within(source).getByRole('button', { name: /Unlink Walk in the old town/ })
    ).toBeInTheDocument();
  });

  it('opens each same-label source from its own data', () => {
    render(<InboxWorkspace layout="dialog" scenario="duplicate-names" />);
    const sources = screen.getAllByRole('button', { name: 'Open Travel note' });
    const second = sources[1];
    if (!second) throw new Error('Second same-label source missing');
    fireEvent.click(second);
    const source = screen.getByRole('dialog');
    expect(source).toHaveTextContent(
      'Check the festival dates before choosing how long to stay in Recife.'
    );
    expect(source).not.toHaveTextContent('Ask Clara');
    expect(within(source).getByRole('link', { name: 'Open source link' })).toHaveAttribute(
      'href',
      'https://recife.example/festival'
    );
    expect(screen.queryByText('Inspect')).not.toBeInTheDocument();
  });

  it('discloses filters and keeps an open source available after organisation hides it', () => {
    render(<InboxWorkspace layout="inline" />);
    expect(screen.queryByRole('combobox', { name: 'Organisation' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Organisation' }));
    fireEvent.click(screen.getByRole('option', { name: 'To organise' }));
    fireEvent.click(screen.getByRole('button', { name: `Open ${note}` }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Existing trip item' }));
    fireEvent.click(screen.getByRole('option', { name: /Walk in the old town/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    expect(screen.getByRole('region', { name: 'Raw source' })).toHaveTextContent(note);
    fireEvent.click(screen.getByRole('button', { name: 'Close item' }));
    expect(screen.queryByRole('button', { name: `Open ${note}` })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear organisation filter' }));
    expect(screen.getByRole('button', { name: `Open ${note}` })).toHaveTextContent('Organised');
  });
});
