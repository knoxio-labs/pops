import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GroupTagBar } from './GroupTagBar';

const VOCABULARY = ['venue:bar', 'venue:cafe', 'contains:alcohol', 'Legacy'];

const FACETS = [
  { facet: 'venue', kind: 'closed' },
  { facet: 'contains', kind: 'open' },
  { facet: 'trip', kind: 'open' },
] as const;

function renderBar(overrides: Partial<Parameters<typeof GroupTagBar>[0]> = {}) {
  const props = {
    stagedTags: [],
    availableTags: VOCABULARY,
    facets: [...FACETS],
    onAddTag: vi.fn(),
    onRemoveTag: vi.fn(),
    onApply: vi.fn(),
    ...overrides,
  };
  render(<GroupTagBar {...props} />);
  return props;
}

function openPicker() {
  fireEvent.focus(screen.getByPlaceholderText('+ Add tag…'));
}

describe('GroupTagBar', () => {
  it('renders staged tags as bare values under their facet colour', () => {
    renderBar({ stagedTags: ['venue:bar'] });

    expect(screen.getByText('Bar')).toBeInTheDocument();
    expect(screen.getByLabelText('Venue: Bar')).toHaveAttribute('data-tag', 'venue:bar');
  });

  it('groups the picker dropdown by facet, unfaceted last', () => {
    renderBar();
    openPicker();

    expect(screen.getAllByRole('group').map((group) => group.getAttribute('aria-label'))).toEqual([
      'Contains',
      'Venue',
      'Other',
    ]);
  });

  it('shows picker options as bare values, never as facet:value', () => {
    renderBar();
    openPicker();

    const options = screen.getAllByRole('button').filter((el) => el.hasAttribute('data-tag'));
    expect(options.map((option) => option.textContent)).toEqual([
      'Alcohol',
      'Bar',
      'Cafe',
      'Legacy',
    ]);
  });

  it('adds the stored string, not the displayed label, when an option is picked', () => {
    const props = renderBar();
    openPicker();

    fireEvent.mouseDown(screen.getByLabelText('Venue: Bar'));

    expect(props.onAddTag).toHaveBeenCalledWith('venue:bar');
  });

  it('renders an unprefixed legacy tag without error', () => {
    expect(() => renderBar({ stagedTags: ['Legacy'] })).not.toThrow();
    expect(screen.getByText('Legacy')).toBeInTheDocument();
  });

  it('completes the first option shown, so Tab agrees with the dropdown', () => {
    const props = renderBar();
    const input = screen.getByPlaceholderText('+ Add tag…');
    fireEvent.focus(input);

    fireEvent.keyDown(input, { key: 'Tab' });

    expect(props.onAddTag).toHaveBeenCalledWith('contains:alcohol');
  });

  it('picks an existing tag on Enter even when the display cap ranks it out of sight', () => {
    // Every filler also matches "bar", so the exact match is ranked 13th and
    // falls outside the visible ten. Enter must still reuse the stored tag
    // rather than mint a near-duplicate from what was typed.
    const filler = Array.from({ length: 12 }, (_, index) => `bar-${index}`);
    const props = renderBar({ availableTags: [...filler, 'bar'] });
    const input = screen.getByPlaceholderText('+ Add tag…');

    fireEvent.change(input, { target: { value: 'BAR' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(props.onAddTag).toHaveBeenCalledWith('bar');
    expect(props.onAddTag).not.toHaveBeenCalledWith('BAR');
  });

  it('reuses the faceted tag when the user types the label the picker shows', () => {
    const props = renderBar();
    const input = screen.getByPlaceholderText('+ Add tag…');

    fireEvent.change(input, { target: { value: 'Bar' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(props.onAddTag).toHaveBeenCalledWith('venue:bar');
    expect(props.onAddTag).not.toHaveBeenCalledWith('Bar');
  });

  it('offers a slugged value on each open axis when the vocabulary has no such value', () => {
    const props = renderBar();
    const input = screen.getByPlaceholderText('+ Add tag…');

    fireEvent.change(input, { target: { value: 'Cairns 2026' } });

    expect(screen.getByLabelText('Create trip:cairns-2026')).toBeInTheDocument();
    expect(screen.getByLabelText('Create contains:cairns-2026')).toBeInTheDocument();
    expect(screen.queryByLabelText('Create venue:cairns-2026')).toBeNull();

    fireEvent.click(screen.getByLabelText('Create trip:cairns-2026'));

    expect(props.onAddTag).toHaveBeenCalledWith('trip:cairns-2026');
  });

  it('refuses to mint an unfaceted tag on Enter', () => {
    const props = renderBar();
    const input = screen.getByPlaceholderText('+ Add tag…');

    fireEvent.change(input, { target: { value: 'Cairns 2026' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(props.onAddTag).not.toHaveBeenCalled();
  });

  it('adds the tag on Enter when the typed text already names an open axis', () => {
    const props = renderBar();
    const input = screen.getByPlaceholderText('+ Add tag…');

    fireEvent.change(input, { target: { value: 'trip:Cairns 2026' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(props.onAddTag).toHaveBeenCalledWith('trip:cairns-2026');
  });

  it('says why a closed axis cannot take a new value instead of offering to create it', () => {
    const props = renderBar();
    const input = screen.getByPlaceholderText('+ Add tag…');

    fireEvent.change(input, { target: { value: 'venue:speakeasy' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByText(/fixed set/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Create venue:speakeasy')).toBeNull();
    expect(props.onAddTag).not.toHaveBeenCalled();
  });

  it('offers no creation at all until the taxonomy has loaded', () => {
    renderBar({ facets: [] });
    const input = screen.getByPlaceholderText('+ Add tag…');

    fireEvent.change(input, { target: { value: 'Cairns 2026' } });

    expect(screen.queryByText(/^Create/i)).toBeNull();
  });

  it('does not guess an axis when two facets share the typed value', () => {
    const props = renderBar({ availableTags: ['venue:bar', 'contains:bar'] });
    const input = screen.getByPlaceholderText('+ Add tag…');

    fireEvent.change(input, { target: { value: 'bar' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(props.onAddTag).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Create contains:bar')).toBeInTheDocument();
  });
});
