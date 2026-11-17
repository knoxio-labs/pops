import type { PairedDevice } from '../../useDevicesPageModel.js';
import type { DeviceGrant } from '../grant-selection.js';

/** Fictional operator-owned device used only by editor tests. */
export const DEVICE: PairedDevice = {
  id: 'fictional-phone',
  name: 'Test phone',
  model: 'Test model',
  subjectEmail: null,
  createdAt: '2026-01-01T00:00:00Z',
  lastSeenAt: '2026-01-01T00:00:00Z',
  revokedAt: null,
};

/** Typed canonical response; overrides model policy drift and unsupported persisted values. */
export function grant(overrides: Partial<DeviceGrant> = {}): DeviceGrant {
  return {
    id: DEVICE.id,
    revision: 4,
    policyToken: 'a'.repeat(64),
    mode: 'explicit',
    stored: ['session.read', 'purchases.read'],
    effective: ['session.read', 'purchases.read'],
    selectable: ['session.read', 'purchases.read', 'documents.upload'],
    ...overrides,
  };
}
