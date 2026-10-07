/**
 * What a stored grant means once the vocabulary has moved under it.
 *
 * The middleware tier proves the gate reads this resolution
 * (`api/auth/__tests__/require-capability.test.ts`); this proves the
 * resolution itself, which is the only tier where the two dangerous
 * directions can be driven at all. Both need a default set that differs from
 * the vocabulary, and today `DEFAULT_DEVICE_CAPABILITIES` IS the whole
 * vocabulary — so they are driven through the injectable `defaults` rather
 * than by editing the shipped constant, which would make the test assert
 * whatever the constant happens to say next month.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_DEVICE_CAPABILITIES,
  GUEST_DEVICE_CAPABILITIES,
  MOBILE_CAPABILITIES,
  resolveDeviceCapabilities,
  serialiseDeviceCapabilities,
  type MobileCapability,
} from '../capabilities.js';

import type { DeviceGrantRow } from '../capabilities.js';

/** The set a device paired in 2026-08 had written into its row. */
const GRANT_AT_PAIRING: readonly string[] = [
  'session.read',
  'finance.transactions.read',
  'purchases.receipts.write',
];

function row(overrides: Partial<DeviceGrantRow> = {}): DeviceGrantRow {
  return {
    id: 'd-iphone',
    capabilities: serialiseDeviceCapabilities(GRANT_AT_PAIRING),
    capabilityMode: 'tracks-default',
    ...overrides,
  };
}

describe('a device that tracks the default grant', () => {
  it('holds a capability added after it paired', () => {
    expect(resolveDeviceCapabilities(row())).toContain('finance.accounts.read');
  });

  it('gains both Ego capabilities on its next request', () => {
    const resolved = resolveDeviceCapabilities(row());

    expect(resolved).toContain('ego.chat');
    expect(resolved).toContain('ego.actions');
  });

  it('holds no more than the default set, even where the vocabulary is wider', () => {
    // The failure mode this guards is "re-resolve" quietly becoming "grant
    // everything this build knows about". `purchases.read` is in the
    // vocabulary and deliberately absent from these defaults.
    const defaults: readonly MobileCapability[] = ['session.read', 'finance.accounts.read'];

    const resolved = resolveDeviceCapabilities(row(), defaults);

    expect([...resolved]).toEqual([...defaults]);
    expect(resolved).not.toContain('purchases.read');
  });

  it('loses a capability the default set no longer grants, even though its row still names it', () => {
    // The row was written with `purchases.receipts.write` and still carries
    // it. Removing it from the default set has to take it away — a resolution
    // that unioned the row with the default would hand it back.
    const defaults: readonly MobileCapability[] = ['session.read', 'finance.transactions.read'];

    const resolved = resolveDeviceCapabilities(row(), defaults);

    expect(resolved).not.toContain('purchases.receipts.write');
  });
});

describe('a device with an explicit grant', () => {
  it('is not widened by the default set', () => {
    // A narrowed grant (POPS-2460) is a removal per device, and re-resolution
    // must not undo it.
    const resolved = resolveDeviceCapabilities(
      row({
        capabilityMode: 'explicit',
        capabilities: serialiseDeviceCapabilities(['session.read']),
      })
    );

    expect([...resolved]).toEqual(['session.read']);
    expect(DEFAULT_DEVICE_CAPABILITIES).toContain('finance.accounts.read');
    expect(resolved).not.toContain('finance.accounts.read');
  });

  it('does not gain Ego capabilities when its explicit grant omits them', () => {
    const resolved = resolveDeviceCapabilities(
      row({
        capabilityMode: 'explicit',
        capabilities: serialiseDeviceCapabilities(['session.read']),
      })
    );

    expect(resolved).not.toContain('ego.chat');
    expect(resolved).not.toContain('ego.actions');
  });

  it('reads an unparseable column as no grant rather than as the default one', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(
      resolveDeviceCapabilities(row({ capabilityMode: 'explicit', capabilities: 'not json' }))
    ).toEqual([]);

    warn.mockRestore();
  });
});

describe('a mode this build does not know', () => {
  it('yields the empty grant, not the default one', () => {
    // SQLite enforces no enumeration, so the value can be anything — a
    // hand-edited row, a column written by a newer build. Failing open here
    // would turn a typo into a fully capable handset.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(resolveDeviceCapabilities(row({ capabilityMode: 'tracks-defaults' }))).toEqual([]);
    expect(resolveDeviceCapabilities(row({ capabilityMode: '' }))).toEqual([]);

    warn.mockRestore();
  });
});

describe('a device bound to a guest', () => {
  function guestRow(overrides: Partial<DeviceGrantRow> = {}): DeviceGrantRow {
    return row({
      id: 'd-guest',
      capabilityMode: 'explicit',
      capabilities: serialiseDeviceCapabilities(GUEST_DEVICE_CAPABILITIES),
      subjectEmail: 'rosane@example.test',
      ...overrides,
    });
  }

  it('is granted exactly the session, the finance reads and the transaction write, written out', () => {
    // Pinned as a literal: the guest set is a decision, and a test that read
    // it back from the constant would agree with whatever it became.
    expect([...GUEST_DEVICE_CAPABILITIES]).toEqual([
      'session.read',
      'finance.accounts.read',
      'finance.transactions.read',
      'finance.transactions.write',
    ]);
  });

  it('holds nothing under purchases, inventory, contacts, barcode or ego', () => {
    const resolved = resolveDeviceCapabilities(guestRow());

    for (const capability of MOBILE_CAPABILITIES) {
      if (/^(?:purchases|inventory|contacts|barcode|ego)\./u.test(capability)) {
        expect(resolved).not.toContain(capability);
      }
    }
  });

  it('is not reached by a capability the vocabulary gains after it paired', () => {
    // The whole vocabulary stands in for "the default set after it grew": it
    // holds every capability the guest set lacks, and none of them may arrive.
    const grown: readonly MobileCapability[] = MOBILE_CAPABILITIES;
    expect(grown.length).toBeGreaterThan(GUEST_DEVICE_CAPABILITIES.length);

    const resolved = resolveDeviceCapabilities(guestRow(), grown);

    expect([...resolved]).toEqual([...GUEST_DEVICE_CAPABILITIES]);
  });

  it('gets the empty grant, not the default one, if its row claims to track the default', () => {
    // Pairing never writes this. A guest row in this mode is a hand edit or a
    // bug, and reading it as the default set would be a guest holding the
    // operator's grant.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(resolveDeviceCapabilities(guestRow({ capabilityMode: 'tracks-default' }))).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });

  it('does not take the default grant from an operator device, with a null or an absent subject', () => {
    expect([...resolveDeviceCapabilities(row({ subjectEmail: null }))]).toEqual([
      ...DEFAULT_DEVICE_CAPABILITIES,
    ]);
    expect([...resolveDeviceCapabilities(row())]).toEqual([...DEFAULT_DEVICE_CAPABILITIES]);
  });
});
