import { expect, it } from 'vitest';

import { createPaperlessUploadIntents } from './paperless-upload-intents.js';
import { MAX_PENDING_UPLOADS, UPLOAD_TOKEN_TTL_MS } from './upload-tokens.js';

it('retains accepted task proof and unknown outcomes without inventing retry safety after expiry/restart', () => {
  let now = 1;
  const intents = createPaperlessUploadIntents(() => now);
  const id = intents.create();
  if (!id) throw new Error('No intent');
  intents.update(id, { state: 'uploading' });
  now += UPLOAD_TOKEN_TTL_MS;
  expect(intents.read(id)).toEqual({ state: 'uploading' });
  intents.update(id, { state: 'accepted', taskId: 'owner-task' });
  expect(intents.read(id)).toEqual({ state: 'accepted', taskId: 'owner-task' });
  expect(createPaperlessUploadIntents().read(id)).toMatchObject({
    state: 'unavailable',
    reason: expect.stringContaining('may have been accepted'),
  });
  now += UPLOAD_TOKEN_TTL_MS;
  expect(intents.read(id)).toMatchObject({ state: 'unavailable' });
});

it('bounds outstanding receipts and frees expired capacity without losing active streams', () => {
  let now = 1;
  const intents = createPaperlessUploadIntents(() => now);
  const ids = Array.from({ length: MAX_PENDING_UPLOADS }, () => intents.create());
  expect(intents.create()).toBeUndefined();
  const first = ids[0];
  if (!first) throw new Error('No intent');
  intents.update(first, { state: 'uploading' });
  now += UPLOAD_TOKEN_TTL_MS;
  expect(intents.create()).toBeDefined();
  expect(intents.read(first)).toEqual({ state: 'uploading' });
});
