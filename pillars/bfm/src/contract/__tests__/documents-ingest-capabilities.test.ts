import { describe, expect, it } from 'vitest';

import { BFM_SERVICE_ACCOUNT_SCOPES } from '../../api/pillars/service-account.js';
import {
  DEFAULT_DEVICE_CAPABILITIES,
  GUEST_DEVICE_CAPABILITIES,
  MOBILE_CAPABILITIES,
  MOBILE_CAPABILITY_SCOPES,
} from '../capabilities.js';

describe('Direct Documents ingest authority', () => {
  it('separates read and upload and does not widen any existing default', () => {
    expect(MOBILE_CAPABILITIES).toContain('documents.upload');
    expect(DEFAULT_DEVICE_CAPABILITIES).toEqual(
      MOBILE_CAPABILITIES.filter((value) => value !== 'documents.upload')
    );
    expect(GUEST_DEVICE_CAPABILITIES).not.toContain('documents.upload');
    expect(MOBILE_CAPABILITY_SCOPES['documents.upload']).toEqual([
      'documents.paperless.status',
      'documents.write.upload',
    ]);
    expect(MOBILE_CAPABILITY_SCOPES['documents.read']).toEqual([
      'documents.paperless.get',
      'documents.paperless.download',
      'documents.paperless.status',
      'documents.paperless.task',
    ]);
    expect(BFM_SERVICE_ACCOUNT_SCOPES.filter((value) => value.startsWith('documents.'))).toEqual([
      'documents.paperless.get',
      'documents.paperless.download',
      'documents.paperless.status',
      'documents.paperless.task',
      'documents.write.upload',
    ]);
  });
});
