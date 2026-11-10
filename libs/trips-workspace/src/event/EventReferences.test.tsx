import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EventReferences } from './EventReferences';
import { sourceEvent } from './test-utils';

import type { EventPatch } from './types';

afterEach(cleanup);

describe('New Event reference input', () => {
  it.each([
    {
      input: ' pops:documents/document/new-ticket ',
      label: '   ',
      link: { uri: 'pops:documents/document/new-ticket' },
    },
    {
      input: ' https://source.example/new-listing ',
      label: ' New listing ',
      link: { uri: 'https://source.example/new-listing', label: 'New listing' },
    },
  ])(
    'normalizes new reference $input and leaves existing opaque sources unchanged',
    ({ input, label, link }) => {
      const initial = sourceEvent();
      const commit = vi.fn<(patch: EventPatch) => void>();
      render(<EventReferences event={initial} commit={commit} />);
      fireEvent.change(screen.getByLabelText('Sources URI'), { target: { value: input } });
      fireEvent.change(screen.getByLabelText('Sources label'), { target: { value: label } });
      fireEvent.click(screen.getByRole('button', { name: 'Add sources link' }));
      expect(commit).toHaveBeenCalledExactlyOnceWith({
        sourceLinks: [...initial.sourceLinks, link],
      });
      expect(screen.getByText('pops:documents/document/ticket')).toBeVisible();
      expect(screen.getByText('pops:contacts/person/venue')).toBeVisible();
    }
  );

  it('does not submit a whitespace-only new URI', () => {
    const commit = vi.fn<(patch: EventPatch) => void>();
    render(<EventReferences event={sourceEvent()} commit={commit} />);
    fireEvent.change(screen.getByLabelText('Sources URI'), { target: { value: '   ' } });
    const add = screen.getByRole('button', { name: 'Add sources link' });
    expect(add).toBeDisabled();
    fireEvent.click(add);
    expect(commit).not.toHaveBeenCalled();
  });
});
