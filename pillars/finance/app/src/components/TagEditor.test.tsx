/**
 * TagEditor — regression tests for the Popover trigger wiring.
 *
 * These tests exist because the trigger wrapper must forwardRef and spread
 * Radix's injected props to the underlying Button. Without that, clicking
 * the tags cell silently no-ops (onClick and ref never reach the DOM),
 * which is exactly what #2162 caught in E2E. Keeping a fast unit check here
 * prevents a regression from slipping past lint refactors in the future.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TagEditor } from './TagEditor';

const FACETS = [
  { facet: 'venue', kind: 'closed' },
  { facet: 'contains', kind: 'open' },
  { facet: 'trip', kind: 'open' },
  { facet: 'flag', kind: 'marker' },
] as const;

describe('TagEditor', () => {
  it('opens the popover and shows the tag input when the trigger is clicked', () => {
    render(
      <TagEditor
        currentTags={['Groceries']}
        availableTags={['Groceries', 'Dining']}
        onSave={vi.fn()}
      />
    );

    // Popover content is portaled into document.body only once the trigger
    // flips open state; before the click it must not be in the DOM.
    expect(screen.queryByPlaceholderText(/Type to add a tag/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Edit tags/i }));

    expect(screen.getByPlaceholderText(/Type to add a tag/i)).toBeInTheDocument();
    // The existing tag renders as a removable Chip inside the popover.
    expect(screen.getByRole('button', { name: /Remove/i })).toBeInTheDocument();
  });

  it('does not open the popover when disabled', () => {
    render(
      <TagEditor
        currentTags={['Groceries']}
        availableTags={['Groceries']}
        onSave={vi.fn()}
        disabled
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Edit tags/i }));

    expect(screen.queryByPlaceholderText(/Type to add a tag/i)).toBeNull();
  });

  it('renders faceted tags on the trigger as bare values, grouped by facet', () => {
    render(
      <TagEditor
        currentTags={['venue:bar', 'contains:alcohol', 'occasion:out']}
        availableTags={[]}
        onSave={vi.fn()}
      />
    );

    const trigger = screen.getByRole('button', { name: /Edit tags/i });
    expect(trigger.textContent).toBe('AlcoholOutBar');
    expect(trigger.textContent).not.toContain(':');
  });

  it('renders an unprefixed legacy tag on the trigger without error', () => {
    render(<TagEditor currentTags={['Groceries']} availableTags={[]} onSave={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Edit tags/i }).textContent).toBe('Groceries');
  });

  it('groups the suggestion list under facet headings', () => {
    render(
      <TagEditor
        currentTags={[]}
        availableTags={['venue:bar', 'contains:alcohol', 'venue:cafe', 'Legacy']}
        onSave={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Edit tags/i }));

    const panel = screen.getByPlaceholderText(/Type to add a tag/i).parentElement;
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain('Contains');
    expect(panel?.textContent).toContain('Venue');
    expect(panel?.textContent).toContain('Other');
    expect(screen.getByRole('button', { name: 'Add Venue: Bar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Contains: Alcohol' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Legacy' })).toBeInTheDocument();
  });

  it('matches the grouped suggestion list', () => {
    render(
      <TagEditor
        currentTags={[]}
        availableTags={['venue:bar', 'contains:alcohol', 'venue:cafe', 'Legacy']}
        onSave={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Edit tags/i }));

    expect(
      screen
        .getAllByRole('button', { name: /^Add / })
        .map((button) => button.getAttribute('aria-label'))
    ).toMatchInlineSnapshot(`
      [
        "Add Contains: Alcohol",
        "Add Venue: Bar",
        "Add Venue: Cafe",
        "Add Legacy",
      ]
    `);
  });

  it('reuses the faceted tag when the user types the label the suggestions show', async () => {
    const onSave = vi.fn();
    render(<TagEditor currentTags={[]} availableTags={['venue:bar']} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: /Edit tags/i }));
    const input = screen.getByPlaceholderText(/Type to add a tag/i);
    fireEvent.change(input, { target: { value: 'Bar' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(['venue:bar']));
  });

  it('saves a value on the axis the user picks, slugged', async () => {
    const onSave = vi.fn();
    render(
      <TagEditor
        currentTags={[]}
        availableTags={['venue:bar']}
        facets={[...FACETS]}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Edit tags/i }));
    fireEvent.change(screen.getByPlaceholderText(/Type to add a tag/i), {
      target: { value: 'Cairns 2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create trip:cairns-2026' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(['trip:cairns-2026']));
  });

  it('offers every open axis and no closed one', () => {
    render(<TagEditor currentTags={[]} availableTags={[]} facets={[...FACETS]} onSave={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Edit tags/i }));
    fireEvent.change(screen.getByPlaceholderText(/Type to add a tag/i), {
      target: { value: 'sunscreen' },
    });

    expect(
      screen
        .getAllByRole('button', { name: /^Create / })
        .map((button) => button.getAttribute('aria-label'))
    ).toEqual(['Create contains:sunscreen', 'Create trip:sunscreen']);
  });

  it('does not store a bare tag when the user presses Enter on a value with no axis', async () => {
    const onSave = vi.fn();
    render(<TagEditor currentTags={[]} availableTags={[]} facets={[...FACETS]} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: /Edit tags/i }));
    const input = screen.getByPlaceholderText(/Type to add a tag/i);
    fireEvent.change(input, { target: { value: 'Cairns 2026' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith([]));
  });

  it('adds on Enter when the typed text already names an open axis', async () => {
    const onSave = vi.fn();
    render(<TagEditor currentTags={[]} availableTags={[]} facets={[...FACETS]} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: /Edit tags/i }));
    const input = screen.getByPlaceholderText(/Type to add a tag/i);
    fireEvent.change(input, { target: { value: 'trip:Cairns 2026' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(['trip:cairns-2026']));
  });

  it('explains a marker axis rather than offering to create on it', () => {
    render(<TagEditor currentTags={[]} availableTags={[]} facets={[...FACETS]} onSave={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Edit tags/i }));
    fireEvent.change(screen.getByPlaceholderText(/Type to add a tag/i), {
      target: { value: 'flag:mine' },
    });

    expect(screen.getByText(/set by the system/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Create / })).toBeNull();
  });

  it('saves on Enter when the input is empty', async () => {
    const onSave = vi.fn();
    render(<TagEditor currentTags={['Groceries']} availableTags={['Groceries']} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: /Edit tags/i }));
    const input = screen.getByPlaceholderText(/Type to add a tag/i);
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(['Groceries']));
  });

  it('reverts an unsaved edit and does not call onSave when dismissed by an outside click', async () => {
    const onSave = vi.fn();
    render(
      <TagEditor
        currentTags={['Groceries']}
        availableTags={['Groceries', 'Dining']}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Edit tags/i }));
    const input = screen.getByPlaceholderText(/Type to add a tag/i);
    fireEvent.change(input, { target: { value: 'Dining' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // The trigger is hidden while the popover is open, so this only asserts
    // against the panel; the regression is in what the trigger shows next.
    expect(screen.getByRole('button', { name: /Remove Dining/i })).toBeInTheDocument();

    // Radix's dismissable layer closes the popover on an outside pointerdown,
    // bypassing the panel's own Cancel button entirely. It wires its listener
    // a tick after mount and, for the primary button, defers to the trailing
    // click — both must be awaited/fired for the dismissal to fire in jsdom.
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.pointerDown(document.body, { button: 0 });
    fireEvent.click(document.body);

    await waitFor(() => expect(screen.queryByPlaceholderText(/Type to add a tag/i)).toBeNull());
    expect(onSave).not.toHaveBeenCalled();
    // Without the fix, the trigger keeps showing "Dining" even though it was
    // never saved, because closing left the editor's local `tags` state dirty.
    expect(screen.getByRole('button', { name: /Edit tags/i }).textContent).toBe('Groceries');
  });

  it('offers no creation when the taxonomy has not loaded', () => {
    render(<TagEditor currentTags={[]} availableTags={[]} onSave={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Edit tags/i }));
    fireEvent.change(screen.getByPlaceholderText(/Type to add a tag/i), {
      target: { value: 'Cairns 2026' },
    });

    expect(screen.queryByRole('button', { name: /^Create / })).toBeNull();
  });
});
