/**
 * Fictional files attached to a transaction, and each outcome of reading a
 * receipt. A photo has a thumbnail and a PDF does not, which is why the two
 * are told apart here rather than by file extension in the screen.
 */
export interface Attachment {
  id: string;
  name: string;
  kind: 'photo' | 'pdf';
  size: string;
  /** PDFs only. */
  pages?: number;
  /** Set while the file is still on its way, or after it failed to arrive. */
  upload?: { state: 'uploading'; percent: number } | { state: 'failed'; reason: string };
}

export const attachments: Attachment[] = [
  { id: 'f1', name: 'receipt-front.jpg', kind: 'photo', size: '2.1 MB' },
  { id: 'f2', name: 'receipt-back.jpg', kind: 'photo', size: '1.8 MB' },
  { id: 'f3', name: 'card-slip.jpg', kind: 'photo', size: '940 KB' },
  { id: 'f4', name: 'booking-confirmation.pdf', kind: 'pdf', size: '312 KB', pages: 2 },
];

export const uploadingAttachments: Attachment[] = [
  ...attachments.slice(0, 2),
  {
    id: 'f5',
    name: 'card-slip.jpg',
    kind: 'photo',
    size: '940 KB',
    upload: { state: 'uploading', percent: 60 },
  },
];

export const failedAttachments: Attachment[] = [
  ...attachments.slice(0, 2),
  {
    id: 'f5',
    name: 'card-slip.jpg',
    kind: 'photo',
    size: '940 KB',
    upload: { state: 'failed', reason: 'The upload stopped partway.' },
  },
];

/** Finance accepts request bodies up to this size; a larger file is refused before it is sent. */
export const MAX_FILE_SIZE_LABEL = '20 MB';

export interface ReceiptReading {
  date: string;
  description: string;
  /** The amount as the receipt prints it, in the receipt's own currency. */
  amount: string;
  currency: string;
}

/**
 * Where reading a receipt can end up. `idle` is a file attached and not yet
 * read. `suggested` and `mismatch` both carry a reading; a mismatch withholds
 * the amount because there is no conversion.
 */
export type ReceiptPrefill =
  | { outcome: 'idle' }
  | { outcome: 'reading' }
  | { outcome: 'suggested'; reading: ReceiptReading }
  | { outcome: 'unreadable' }
  | { outcome: 'unavailable' }
  | { outcome: 'mismatch'; reading: ReceiptReading; accountCurrency: string };

export const trattoriaReading: ReceiptReading = {
  date: '2026-09-28',
  description: 'Sample Trattoria',
  amount: '86.00',
  currency: 'AUD',
};

export const euroReading: ReceiptReading = {
  date: '2026-09-28',
  description: 'Sample Bistro Lisboa',
  amount: '42.50',
  currency: 'EUR',
};
