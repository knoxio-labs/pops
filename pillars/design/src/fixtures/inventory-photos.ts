/**
 * Photo sets for the inventory photo controls: the gallery, the thumbnail
 * strip, the reorderable grid, and the upload queue.
 *
 * `PHOTOS_BY_ITEM` covers the branches those controls render on: an item
 * with several photos (gallery + thumbnail strip + reorder grid all have
 * something to show), one with exactly one (no thumbnail strip, no
 * reordering), one with none (the empty state), and one whose only photo has
 * a URL that fails to load: the browser's own broken-image fallback, since
 * none of the ported controls implement an error-recovery branch of their
 * own.
 *
 * `UPLOAD_QUEUE_FIXTURES` covers the same range for `PhotoUpload`: a done
 * row, an uploading row with partial progress, a pending row and a failed
 * row.
 *
 * Every URL is an inline SVG `data:` URI, so the canvas needs no network and
 * no binary assets. `svgPhoto` renders a flat colour with a label so photos
 * stay visually distinguishable at thumbnail size.
 */
import type { PhotoItem } from '@/kit/inventory/photos/photo-gallery';
import type { UploadedFile } from '@/kit/inventory/photos/photo-upload';

function svgPhoto(color: string, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="${color}"/><text x="50%" y="50%" font-size="28" fill="white" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Deliberately not a photo: valid base64, but the decoded bytes are not a
 * recognisable image format, so the browser fires the `<img>` element's
 * `error` event instead of painting anything.
 */
const BROKEN_PHOTO_URL = 'data:image/png;base64,AAAA';

export const PHOTOS_BY_ITEM: Record<string, PhotoItem[]> = {
  'itm-tv': [
    {
      id: 1,
      url: svgPhoto('#2563eb', 'Front'),
      caption: 'Wall-mounted, bracket bolts in left drawer',
      sortOrder: 0,
    },
    {
      id: 2,
      url: svgPhoto('#7c3aed', 'Serial'),
      caption: 'Serial number label',
      sortOrder: 1,
    },
    {
      id: 3,
      url: svgPhoto('#0891b2', 'Remote'),
      caption: null,
      sortOrder: 2,
    },
    {
      id: 4,
      url: svgPhoto('#059669', 'Box'),
      caption: 'Original box, kept in garage',
      sortOrder: 3,
    },
  ],
  'itm-laptop': [
    {
      id: 5,
      url: svgPhoto('#ea580c', 'Laptop'),
      caption: 'MacBook Pro, lid closed',
      sortOrder: 0,
    },
  ],
  'itm-empty': [],
  'itm-broken-photo': [
    {
      id: 6,
      url: BROKEN_PHOTO_URL,
      caption: 'Uploaded from a corrupted export',
      sortOrder: 0,
    },
  ],
};

function fileNamed(name: string, type = 'image/jpeg'): File {
  return new File([''], name, { type });
}

export const UPLOAD_QUEUE_FIXTURES: UploadedFile[] = [
  {
    localId: 'upload-done',
    file: fileNamed('receipt-photo.jpg'),
    previewUrl: svgPhoto('#059669', 'Done'),
    status: 'done',
    originalSize: 4_200_000,
    processedSize: 610_000,
  },
  {
    localId: 'upload-uploading',
    file: fileNamed('warranty-card.jpg'),
    previewUrl: svgPhoto('#2563eb', 'Sending'),
    status: 'uploading',
    progress: 64,
  },
  {
    localId: 'upload-pending',
    file: fileNamed('serial-plate.jpg'),
    previewUrl: svgPhoto('#7c3aed', 'Queued'),
    status: 'pending',
  },
  {
    localId: 'upload-error',
    file: fileNamed('box-contents.heic'),
    previewUrl: '',
    status: 'error',
    error: 'Upload timed out',
  },
];
