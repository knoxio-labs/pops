import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';

import { CaptureBrowserSession } from './browser-session';
import { IdeaReferences } from './IdeaReferences';
import { captureSource, sourceIdea } from './test-utils';

import type { ContactsHostCapability } from '@pops/pillar-sdk';

import type { CaptureRequest, CaptureSource } from './types';

const contacts: ContactsHostCapability = { createIntent: () => ({ Chooser: () => null }) };

afterEach(cleanup);

function mount(
  source: CaptureSource,
  perform: (request: CaptureRequest) => Promise<never> = async () => {
    throw new Error('Producer rejected the edit');
  }
) {
  const requests: CaptureRequest[] = [];
  const session = new CaptureBrowserSession(
    source,
    1,
    async (request) => {
      requests.push(request);
      return perform(request);
    },
    contacts
  );
  const row = source.ideas[0];
  if (!row) throw new Error('Idea fixture missing');
  render(<IdeaReferences session={session} row={row} value={row} busy={false} />);
  return { session, row, requests };
}

it('keeps duplicate source link entries distinct and retains an invalid URI draft after producer rejection', async () => {
  const row = sourceIdea({
    id: 7,
    sourceLinks: [
      { uri: 'not a URI', label: 'same' },
      { uri: 'not a URI', label: 'same' },
    ],
  });
  const { session, row: idea } = mount({ ...captureSource(), ideas: [row] });
  const uri = screen.getByRole('textbox', { name: 'Source URI 1' });
  fireEvent.change(uri, { target: { value: 'still invalid' } });
  fireEvent.blur(uri);
  expect(session.records.idea(idea.id)?.input.sourceLinks?.[0]?.uri).toBe('still invalid');
  expect(screen.getByRole('textbox', { name: 'Source URI 1' })).toHaveValue('still invalid');
  expect(session.records.idea(idea.id)?.input.sourceLinks).toEqual([
    { uri: 'still invalid', label: 'same' },
    { uri: 'not a URI', label: 'same' },
  ]);
  expect(screen.getByRole('textbox', { name: 'Source URI 2' })).toHaveValue('not a URI');
});

it('adds a blank retained source entry without sending until blur, then saves exact replacement', async () => {
  const row = sourceIdea({ id: 9 });
  const { session, requests } = mount({ ...captureSource(), ideas: [row] });
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Add source link' }));
  expect(session.records.idea(row.id)?.input.sourceLinks).toEqual([{ uri: '' }]);
  expect(requests).toEqual([]);
  fireEvent.change(screen.getByRole('textbox', { name: 'Source URI 1' }), {
    target: { value: 'https://example.test/source' },
  });
  fireEvent.blur(screen.getByRole('textbox', { name: 'Source URI 1' }));
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    command: {
      kind: 'idea.update',
      input: { sourceLinks: [{ uri: 'https://example.test/source' }] },
    },
  });
});

it('opens finite Contacts contexts and removes canonical references only through the Trips array update', async () => {
  const reference = { uri: 'pops:contacts/contact/owner-17', label: 'Canonical' };
  const row = sourceIdea({
    id: 11,
    contactLinks: [reference, reference],
    recommendations: [{ contact: reference, note: 'Keep verbatim' }],
  });
  const { session, requests } = mount({ ...captureSource(), ideas: [row] });
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Add contact' }));
  expect(session.contacts.snapshot()?.intent).toEqual({ kind: 'idea-contact', id: 11 });
  await user.click(screen.getByRole('button', { name: 'Add recommendation' }));
  expect(session.contacts.snapshot()?.intent).toEqual({ kind: 'recommendation', id: 11 });
  const contactRows = screen.getAllByText('Canonical');
  expect(contactRows).toHaveLength(3);
  await user.click(screen.getByRole('button', { name: 'Remove contact reference 1' }));
  expect(requests[0]).toMatchObject({
    command: { kind: 'idea.update', input: { contactLinks: [reference] } },
  });
  expect(
    requests.every((request) => !('command' in request) || request.command.kind === 'idea.update')
  ).toBe(true);
  expect(
    within(screen.getByRole('region', { name: 'Idea references' })).getByRole('textbox', {
      name: 'Recommendation note 1',
    })
  ).toHaveValue('Keep verbatim');
});

it('keeps the focused editable row through every keystroke and saves verbatim only on blur', async () => {
  const row = sourceIdea({
    id: 12,
    sourceLinks: [{ uri: '' }],
    recommendations: [{ contact: { uri: 'pops:contacts/contact/opaque' }, note: '' }],
  });
  const { requests } = mount({ ...captureSource(), ideas: [row] });
  const user = userEvent.setup();
  const uri = screen.getByRole('textbox', { name: 'Source URI 1' });
  await user.type(uri, 'https://example.test/Ω');
  expect(uri).toHaveFocus();
  expect(uri).toHaveValue('https://example.test/Ω');
  expect(requests).toEqual([]);
  await user.tab();
  await waitFor(() => expect(requests).toHaveLength(1));
});

it('keeps the recommendation note focused and retains its verbatim rejected draft', async () => {
  const row = sourceIdea({
    id: 13,
    recommendations: [{ contact: { uri: 'pops:contacts/contact/opaque' }, note: '' }],
  });
  const { session, requests } = mount({ ...captureSource(), ideas: [row] });
  const user = userEvent.setup();
  const note = screen.getByRole('textbox', { name: 'Recommendation note 1' });
  await user.type(note, '  keep Ω\nverbatim  ');
  expect(note).toHaveFocus();
  expect(note).toHaveValue('  keep Ω\nverbatim  ');
  await user.tab();
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(session.records.idea(row.id)?.input.recommendations?.[0]?.note).toBe(
    '  keep Ω\nverbatim  '
  );
  expect(requests[0]).toMatchObject({
    command: {
      kind: 'idea.update',
      input: { recommendations: [{ note: '  keep Ω\nverbatim  ' }] },
    },
  });
});
