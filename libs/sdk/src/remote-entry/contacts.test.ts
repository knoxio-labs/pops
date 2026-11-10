import { expectTypeOf, it } from 'vitest';

import type {
  ContactChooserIntent,
  ContactReferenceReadOptions,
  ContactReferenceReadResult,
  ContactsHostCapability,
} from './contacts.js';

it('keeps chooser-only hosts assignable while exposing the optional abort-aware owner reader', () => {
  expectTypeOf<{ createIntent: () => ContactChooserIntent }>().toExtend<ContactsHostCapability>();
  expectTypeOf<ContactsHostCapability['readContactReference']>().toEqualTypeOf<
    | ((uri: string, options?: { signal?: AbortSignal }) => Promise<ContactReferenceReadResult>)
    | undefined
  >();
  expectTypeOf<ContactReferenceReadOptions>().toEqualTypeOf<{ signal?: AbortSignal }>();
});

it('requires verified identity and source navigation for available results without exposing owner entities', () => {
  expectTypeOf<Extract<ContactReferenceReadResult, { status: 'available' }>>().toExtend<{
    status: 'available';
    name: string;
    reference: { canonicalId: string; uri: string };
    href: string;
  }>();
  expectTypeOf<{
    status: 'available';
    name: string;
    href: string;
  }>().not.toExtend<ContactReferenceReadResult>();
  expectTypeOf<keyof Extract<ContactReferenceReadResult, { status: 'available' }>>().toEqualTypeOf<
    'status' | 'name' | 'reference' | 'href'
  >();
});

it('separates missing, unavailable and failed reads from the consumers unread state', () => {
  expectTypeOf<ContactReferenceReadResult['status']>().toEqualTypeOf<
    'available' | 'missing' | 'unavailable' | 'readError'
  >();
  expectTypeOf<{ status: 'unverified' }>().not.toExtend<ContactReferenceReadResult>();
  expectTypeOf<Extract<ContactReferenceReadResult, { status: 'missing' }>>().toEqualTypeOf<{
    status: 'missing';
  }>();
  expectTypeOf<
    Extract<ContactReferenceReadResult, { status: 'unavailable' }>['reference']
  >().toEqualTypeOf<{ canonicalId: string; uri: string } | undefined>();
  expectTypeOf<
    Extract<ContactReferenceReadResult, { status: 'readError' }>['reference']
  >().toEqualTypeOf<{ canonicalId: string; uri: string } | undefined>();
});
