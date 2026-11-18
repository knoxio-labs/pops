import { buildRawDiscovery, resolveApiKey, SERVICE_ACCOUNT_HEADER } from '@pops/pillar-sdk/server';

import { requireBookingPdfMediaType } from '../../db/services/booking-import-media.js';
import { TripsServiceError } from '../../db/services/source-record.js';

import type { RawDiscovery } from '@pops/pillar-sdk/server';

import type { BookingOriginalDependencies } from '../../db/services/booking-import-original.js';

/** Public SDK discovery and transport seams for the sanctioned Documents original-byte route. */
export interface BookingDocumentReaderDependencies {
  readonly discovery?: RawDiscovery;
  readonly fetchImpl?: typeof fetch;
  readonly apiKey?: () => string | undefined;
}
/** Read exact originals without redirects; changed discovery cannot deliver bytes as another owner. */
export function createBookingDocumentReader(
  deps: BookingDocumentReaderDependencies = {}
): NonNullable<BookingOriginalDependencies['readDocument']> {
  const discovery = deps.discovery ?? buildRawDiscovery();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const apiKey = deps.apiKey ?? resolveApiKey;
  return async ({ documentId }) => {
    const target = await discovery.lookup('documents');
    const key = apiKey();
    if (target === undefined || key === undefined)
      throw new TripsServiceError('booking_import_unavailable');
    const baseUrl = target.baseUrl.replace(/\/$/u, '');
    const origin = new URL(baseUrl).origin;
    try {
      const response = await fetchImpl(
        `${baseUrl}/paperless/documents/${documentId}/download?original=true`,
        {
          method: 'GET',
          redirect: 'error',
          headers: { [SERVICE_ACCOUNT_HEADER]: key },
        }
      );
      if (response.status !== 200 || response.body === null) {
        await response.body?.cancel();
        throw new TripsServiceError('booking_import_unavailable');
      }
      let mediaType: 'application/pdf';
      try {
        mediaType = requireBookingPdfMediaType(response.headers.get('content-type'));
      } catch (error) {
        await response.body.cancel();
        throw error;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      const current = await discovery.lookup('documents');
      if (current?.baseUrl.replace(/\/$/u, '') !== baseUrl)
        throw new TripsServiceError('booking_import_unavailable');
      return { origin, mediaType, bytes };
    } catch (error) {
      if (error instanceof TripsServiceError) throw error;
      throw new TripsServiceError('booking_import_unavailable');
    }
  };
}
