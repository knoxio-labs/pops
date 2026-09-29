import { describe, expect, it } from 'vitest';

import {
  addPhotos,
  formatBytes,
  PHOTO_BYTE_LIMIT,
  photoRefusal,
  photoSummary,
  removePhoto,
  retryPhoto,
  startStagedUploads,
} from './photo-queue';

import type { PhotoUpload } from './photo-queue';

const file = (localId: string, fileName = `${localId}.jpg`, mimeType = 'image/jpeg') => ({
  localId,
  fileName,
  bytes: 1024,
  mimeType,
});

const upload = (localId: string, status: PhotoUpload['status']): PhotoUpload => ({
  localId,
  fileName: `${localId}.jpg`,
  bytes: 1024,
  status,
});

describe('photo queue', () => {
  it('holds photos chosen while creating until the item exists', () => {
    const result = addPhotos([], [file('one'), file('two')], 'create');

    expect(result.refused).toEqual([]);
    expect(result.queue.map((photo) => photo.status)).toEqual([
      { kind: 'staged' },
      { kind: 'staged' },
    ]);
  });

  it('uploads at once when the item already exists', () => {
    const result = addPhotos([], [file('one')], 'edit');

    expect(result.queue[0]?.status).toEqual({ kind: 'uploading', percent: 0 });
  });

  it('refuses files that are not images or are too large, keeping the rest', () => {
    const result = addPhotos(
      [],
      [
        file('good'),
        file('text', 'notes.txt', 'text/plain'),
        { ...file('large'), bytes: PHOTO_BYTE_LIMIT + 1 },
      ],
      'create'
    );

    expect(result.queue.map((photo) => photo.localId)).toEqual(['good']);
    expect(result.refused).toEqual(['notes.txt is not an image.', 'large.jpg is over 20 MB.']);
  });

  it('takes a photo of exactly the limit', () => {
    expect(photoRefusal({ ...file('limit'), bytes: PHOTO_BYTE_LIMIT })).toBeNull();
  });

  it('starts every staged photo once the item is created, leaving settled photos alone', () => {
    const queue = [
      upload('one', { kind: 'staged' }),
      upload('two', { kind: 'attached' }),
      upload('three', { kind: 'failed', reason: 'not saved' }),
    ];

    expect(startStagedUploads(queue)).toEqual([
      upload('one', { kind: 'uploading', percent: 0 }),
      queue[1],
      queue[2],
    ]);
  });

  it('removes only the named photo', () => {
    const queue = [upload('one', { kind: 'staged' }), upload('two', { kind: 'staged' })];

    expect(removePhoto(queue, 'one')).toEqual([queue[1]]);
  });

  it('retries a failed photo and nothing else', () => {
    const queue = [
      upload('failed', { kind: 'failed', reason: 'not saved' }),
      upload('staged', { kind: 'staged' }),
    ];

    expect(retryPhoto(queue, 'failed')).toEqual([
      upload('failed', { kind: 'uploading', percent: 0 }),
      queue[1],
    ]);
    expect(retryPhoto(queue, 'unknown')).toEqual(queue);
  });

  it('says staged photos upload on save', () => {
    expect(photoSummary([upload('one', { kind: 'staged' })])).toBe('1 photo upload when you save.');
    expect(
      photoSummary([upload('one', { kind: 'staged' }), upload('two', { kind: 'staged' })])
    ).toBe('2 photos upload when you save.');
  });

  it('counts uploads through the ones already attached', () => {
    expect(
      photoSummary([
        upload('one', { kind: 'attached' }),
        upload('two', { kind: 'uploading', percent: 30 }),
        upload('three', { kind: 'uploading', percent: 90 }),
      ])
    ).toBe('Uploading 2 of 3.');
  });

  it('puts a failure first and says the item is saved', () => {
    expect(
      photoSummary([
        upload('one', { kind: 'uploading', percent: 30 }),
        upload('two', { kind: 'failed', reason: 'not saved' }),
      ])
    ).toBe('1 photo did not upload. The item is saved.');
  });

  it('has nothing to say about an empty or finished queue', () => {
    expect(photoSummary([])).toBeNull();
    expect(photoSummary([upload('one', { kind: 'attached' })])).toBeNull();
  });

  it('reads in KB under a megabyte and MB above', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });
});
