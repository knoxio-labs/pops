import { MIMEType } from 'node:util';

import { TripsServiceError } from './source-record.js';

/** Admit only the actual owner response's PDF media essence supported by the public AI document input. */
export function requireBookingPdfMediaType(contentType: string | null): 'application/pdf' {
  if (contentType !== null) {
    try {
      if (new MIMEType(contentType).essence === 'application/pdf') return 'application/pdf';
    } catch {
      throw new TripsServiceError('booking_import_invalid');
    }
  }
  throw new TripsServiceError('booking_import_invalid');
}
