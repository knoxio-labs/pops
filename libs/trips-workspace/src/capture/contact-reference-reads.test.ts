import { expect, it, vi } from 'vitest';

import { CaptureBrowserSession } from './browser-session';
import { CaptureContactReferenceReads } from './contact-reference-reads';
import { captureSource, deferred } from './test-utils';

import type { ContactReferenceReadResult, ContactsHostCapability } from '@pops/pillar-sdk';

const uri = 'pops:contacts/contact/original';
const available: ContactReferenceReadResult = {
  status: 'available',
  name: 'Actual owner name',
  href: '/contacts/canonical',
  reference: { canonicalId: 'canonical', uri: 'pops:contacts/contact/canonical' },
};

it('shares an in-flight read, retains the canonical owner result and retries only explicitly', async () => {
  const gate = deferred<ContactReferenceReadResult>();
  const read = vi.fn(async () => gate.promise);
  const reads = new CaptureContactReferenceReads(read);
  expect(reads.snapshot(uri)).toEqual({ status: 'unverified' });
  const first = reads.load(uri);
  const second = reads.load(uri, true);
  expect(first).toBe(second);
  expect(reads.snapshot(uri)).toEqual({ status: 'loading' });
  await Promise.resolve();
  expect(read).toHaveBeenCalledExactlyOnceWith(uri);
  gate.resolve(available);
  await first;
  expect(reads.snapshot(uri)).toBe(available);
  await reads.load(uri);
  expect(read).toHaveBeenCalledTimes(1);
  await reads.load(uri, true);
  expect(read).toHaveBeenCalledTimes(2);
});

it.each(['missing', 'unavailable', 'readError'] as const)(
  'preserves %s separately and never turns a failed metadata read into missing',
  async (status) => {
    const reads = new CaptureContactReferenceReads(async () => ({ status }));
    await reads.load(uri);
    expect(reads.snapshot(uri)).toEqual({ status });
    expect(reads.availability(uri)).toBe(status === 'missing' ? 'missing' : 'unverified');
  }
);

it('retains unverified without a reader, uses explicit chooser evidence, and contains transport rejection', async () => {
  const unread = new CaptureContactReferenceReads(undefined, (value) => value === uri);
  await unread.load(uri);
  expect(unread.snapshot(uri)).toEqual({ status: 'unverified' });
  expect(unread.availability(uri)).toBe('available');
  expect(unread.availability('pops:contacts/contact/other')).toBe('unverified');
  const reads = new CaptureContactReferenceReads(async () => {
    throw new Error('Module unavailable');
  });
  await reads.load(uri);
  expect(reads.snapshot(uri)).toEqual({ status: 'unavailable' });
  expect(reads.availability(uri)).toBe('unverified');
});

it('keeps reads scoped to each owning trip session and never writes or resolves an association', async () => {
  const readContactReference = vi.fn(async () => available);
  const contacts: ContactsHostCapability = {
    createIntent: () => ({ Chooser: () => null }),
    readContactReference,
  };
  const perform = vi.fn();
  const first = new CaptureBrowserSession(captureSource(), 1, perform, contacts);
  const second = new CaptureBrowserSession(captureSource(), 2, perform, contacts);
  await first.contactReads.load(uri);
  expect(second.contactReads.snapshot(uri)).toEqual({ status: 'unverified' });
  await second.contactReads.load(uri);
  expect(readContactReference).toHaveBeenCalledTimes(2);
  expect(perform).not.toHaveBeenCalled();
  expect(first.contacts.snapshot()).toBeNull();
  expect(first.editor.getState().confirmation).toBeNull();
});

it.each(['missing', 'unavailable', 'readError'] as const)(
  'never revives bootstrap chooser evidence while retrying a prior %s owner outcome',
  async (status) => {
    const gate = deferred<ContactReferenceReadResult>();
    const read = vi
      .fn<() => Promise<ContactReferenceReadResult>>()
      .mockResolvedValueOnce({ status })
      .mockImplementationOnce(() => gate.promise);
    const reads = new CaptureContactReferenceReads(read, () => true);
    expect(reads.availability(uri)).toBe('available');
    await reads.load(uri);
    expect(reads.availability(uri)).toBe(status === 'missing' ? 'missing' : 'unverified');
    const retry = reads.load(uri, true);
    expect(reads.snapshot(uri)).toEqual({ status: 'loading' });
    expect(reads.availability(uri)).toBe('unverified');
    gate.resolve(available);
    await retry;
    expect(reads.availability(uri)).toBe('available');
  }
);
