import { describe, expect, it } from 'vitest';

import {
  PHOTO_BYTE_LIMIT,
  addPhotos,
  formatBytes,
  photoSummary,
  removePhoto,
  retryPhoto,
  startStagedUploads,
} from './photo-queue';

import type { PhotoFile, PhotoUpload } from './photo-queue';

const jpeg = (localId: string, bytes = 2_000_000): PhotoFile => ({
  localId,
  fileName: `${localId}.jpg`,
  bytes,
  mimeType: 'image/jpeg',
});

describe('addPhotos', () => {
  it('holds photos chosen while creating until the item exists', () => {
    const { queue } = addPhotos([], [jpeg('a'), jpeg('b')], 'create');
    expect(queue.map((photo) => photo.status.kind)).toEqual(['staged', 'staged']);
  });

  it('uploads at once when the item already exists', () => {
    const { queue } = addPhotos([], [jpeg('a')], 'edit');
    expect(queue[0]?.status).toEqual({ kind: 'uploading', percent: 0 });
  });

  it('refuses files that are not images or are too large, keeping the rest', () => {
    const { queue, refused } = addPhotos(
      [],
      [
        jpeg('ok'),
        { localId: 'pdf', fileName: 'receipt.pdf', bytes: 10, mimeType: 'application/pdf' },
        jpeg('huge', PHOTO_BYTE_LIMIT + 1),
      ],
      'create'
    );
    expect(queue.map((photo) => photo.localId)).toEqual(['ok']);
    expect(refused).toEqual(['receipt.pdf is not an image.', 'huge.jpg is over 20 MB.']);
  });

  it('takes a photo of exactly the limit', () => {
    expect(addPhotos([], [jpeg('edge', PHOTO_BYTE_LIMIT)], 'create').queue).toHaveLength(1);
  });
});

describe('startStagedUploads', () => {
  it('starts every staged photo once the item is created, dropping none', () => {
    const staged = addPhotos([], [jpeg('a'), jpeg('b'), jpeg('c')], 'create').queue;
    const after = startStagedUploads(staged);
    expect(after).toHaveLength(3);
    expect(after.every((photo) => photo.status.kind === 'uploading')).toBe(true);
    expect(after.map((photo) => photo.localId)).toEqual(['a', 'b', 'c']);
  });

  it('leaves photos that already moved on alone', () => {
    const queue: PhotoUpload[] = [
      { localId: 'x', fileName: 'x.jpg', bytes: 1, status: { kind: 'attached' } },
      { localId: 'y', fileName: 'y.jpg', bytes: 1, status: { kind: 'failed', reason: 'r' } },
    ];
    expect(startStagedUploads(queue)).toEqual(queue);
  });
});

describe('removePhoto and retryPhoto', () => {
  const queue: PhotoUpload[] = [
    { localId: 'x', fileName: 'x.jpg', bytes: 1, status: { kind: 'failed', reason: 'r' } },
    { localId: 'y', fileName: 'y.jpg', bytes: 1, status: { kind: 'attached' } },
  ];

  it('removes only the named photo', () => {
    expect(removePhoto(queue, 'x').map((photo) => photo.localId)).toEqual(['y']);
  });

  it('retries a failed photo and nothing else', () => {
    const after = retryPhoto(queue, 'x');
    expect(after[0]?.status).toEqual({ kind: 'uploading', percent: 0 });
    expect(retryPhoto(queue, 'y')).toEqual(queue);
  });
});

describe('photoSummary', () => {
  const photo = (localId: string, status: PhotoUpload['status']): PhotoUpload => ({
    localId,
    fileName: `${localId}.jpg`,
    bytes: 1,
    status,
  });

  it('says staged photos upload on save', () => {
    expect(photoSummary([photo('a', { kind: 'staged' })])).toBe('1 photo upload when you save.');
    expect(photoSummary([photo('a', { kind: 'staged' }), photo('b', { kind: 'staged' })])).toBe(
      '2 photos upload when you save.'
    );
  });

  it('counts uploads through the ones already attached', () => {
    expect(
      photoSummary([
        photo('a', { kind: 'attached' }),
        photo('b', { kind: 'uploading', percent: 40 }),
        photo('c', { kind: 'uploading', percent: 0 }),
      ])
    ).toBe('Uploading 2 of 3.');
  });

  it('puts a failure first and says the item is saved', () => {
    expect(
      photoSummary([
        photo('a', { kind: 'uploading', percent: 10 }),
        photo('b', { kind: 'failed', reason: 'timeout' }),
      ])
    ).toBe('1 photo did not upload. The item is saved.');
  });

  it('has nothing to say about an empty or finished queue', () => {
    expect(photoSummary([])).toBeNull();
    expect(photoSummary([photo('a', { kind: 'attached' })])).toBeNull();
  });
});

describe('formatBytes', () => {
  it('reads in KB under a megabyte and MB above', () => {
    expect(formatBytes(300)).toBe('1 KB');
    expect(formatBytes(512 * 1024)).toBe('512 KB');
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });
});
