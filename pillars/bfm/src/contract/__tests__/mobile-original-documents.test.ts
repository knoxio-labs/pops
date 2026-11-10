import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DEVICE_CAPABILITIES,
  GUEST_DEVICE_CAPABILITIES,
  MOBILE_CAPABILITY_SCOPES,
  resolveDeviceCapabilities,
} from '../capabilities.js';
import { mobileDocumentsContract } from '../rest-mobile-documents.js';

const explicit = {
  id: 'device',
  capabilityMode: 'explicit',
  capabilities: JSON.stringify(['trips.read']),
};
describe('original-document authority', () => {
  it('follows the operator catalogue without widening explicit or guest device grants', () => {
    expect(DEFAULT_DEVICE_CAPABILITIES).toContain('documents.read');
    expect(resolveDeviceCapabilities({ ...explicit, capabilityMode: 'tracks-default' })).toContain(
      'documents.read'
    );
    expect(resolveDeviceCapabilities(explicit)).not.toContain('documents.read');
    expect(GUEST_DEVICE_CAPABILITIES).not.toContain('documents.read');
    expect(
      resolveDeviceCapabilities({
        ...explicit,
        capabilityMode: 'tracks-default',
        subjectEmail: 'guest@example.test',
      })
    ).not.toContain('documents.read');
  });
  it('declares independent capability and exact read grants, without granting writes', () => {
    expect(mobileDocumentsContract.getDocument.metadata).toEqual({ capability: 'documents.read' });
    expect(MOBILE_CAPABILITY_SCOPES['documents.read']).toEqual([
      'documents.paperless.get',
      'documents.paperless.download',
    ]);
    expect(MOBILE_CAPABILITY_SCOPES['trips.read']).not.toContain('documents.paperless.get');
  });
});
