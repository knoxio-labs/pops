import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DEVICE_CAPABILITIES,
  GUEST_DEVICE_CAPABILITIES,
  MOBILE_CAPABILITY_SCOPES,
} from '../capabilities.js';
import { MobileCaptureAttachSchema } from '../mobile-trip-capture-schemas.js';
import { mobileTripCapturesContract } from '../rest-mobile-trip-captures.js';

describe('capture attachment contract', () => {
  it('uses the existing explicit write grant without acquiring Documents authority', () => {
    expect(mobileTripCapturesContract.attach.metadata).toEqual({
      capability: 'trips.capture.write',
    });
    expect(MOBILE_CAPABILITY_SCOPES['trips.capture.write']).toEqual([
      'trips.captures.create',
      'trips.captures.update',
      'trips.captures.attach',
      'trips.captures.undo',
    ]);
    expect(DEFAULT_DEVICE_CAPABILITIES).not.toContain('trips.capture.write');
    expect(GUEST_DEVICE_CAPABILITIES).not.toContain('trips.capture.write');
    expect(MOBILE_CAPABILITY_SCOPES['documents.read']).not.toContain('trips.captures.attach');
    expect(MOBILE_CAPABILITY_SCOPES['trips.read']).not.toContain('trips.captures.attach');
  });

  it('preserves the owning task grammar at its published boundary', () => {
    const input = {
      operationId: '3b5f6780-4111-4111-8111-111111111111',
      command: {
        kind: 'capture.attach',
        id: 3,
        expectedRevision: 4,
        attachment: { kind: 'task', taskId: `_${'a'.repeat(70)}-` },
      },
    };
    expect(MobileCaptureAttachSchema.parse(input)).toEqual(input);
    expect(
      MobileCaptureAttachSchema.safeParse({
        ...input,
        command: {
          ...input.command,
          attachment: {
            ...input.command.attachment,
            taskId: `${input.command.attachment.taskId}x`,
          },
        },
      }).success
    ).toBe(false);
  });
});
