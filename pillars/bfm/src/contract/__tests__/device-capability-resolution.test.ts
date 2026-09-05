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
