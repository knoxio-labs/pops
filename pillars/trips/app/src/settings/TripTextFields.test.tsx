import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { tripDraft } from './model';
import { TripTextFields } from './TripTextFields';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(cleanup);

it('preserves one opaque multiline When field without changing other trip facts', () => {
  const draft = {
    ...tripDraft(),
    destination: 'Source city',
    name: 'Source trip',
    when: '  after winter\nperhaps  ',
  };
  const change = vi.fn();
  render(<TripTextFields draft={draft} change={change} />);
  const fields = screen.getAllByRole('textbox', { name: 'when' });
  expect(fields).toHaveLength(1);
  const field = fields[0];
  if (!(field instanceof HTMLTextAreaElement)) throw new Error('When must preserve multiline text');
  expect(field).toHaveValue(draft.when);
  const raw = '  spring?\nNot a route date\n  ';
  fireEvent.change(field, { target: { value: raw } });
  expect(change).toHaveBeenCalledExactlyOnceWith({ ...draft, when: raw });
  expect(screen.getByRole('textbox', { name: 'destination' })).toHaveValue(draft.destination);
  expect(screen.getByRole('textbox', { name: 'name' })).toHaveValue(draft.name);
});
