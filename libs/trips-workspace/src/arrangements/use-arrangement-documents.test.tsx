import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { createClient } from '../documents-api/client';
import { sourceUploadSession } from '../shared/source-upload-sessions';
import { createClient as createTripsClient } from '../trips-api/client';
import { labels } from './test-utils';
import { useArrangementDocuments } from './use-arrangement-documents';

import type { PropsWithChildren } from 'react';

const target = { targetKind: 'stay', targetId: 13 } as const;
const base = { tripId: 7, labels, formatDate: (date: string): string => date };
afterEach(cleanup);
function ownerScope() {
  const cache = new QueryClient();
  return {
    cache,
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={cache}>{children}</QueryClientProvider>
    ),
  };
}
describe('Arrangement document intent scope', () => {
  it('keeps actual owner File handles for an exact target while other target kinds and trips remain independent', () => {
    const scope = ownerScope();
    const { result, rerender } = renderHook(
      ({ tripId }) => useArrangementDocuments({ ...base, tripId }),
      { initialProps: { tripId: 7 }, wrapper: scope.wrapper }
    );
    const original = result.current(target);
    if (!original) throw new Error('Expected the Stay owner session');
    expect(original).toBe(
      sourceUploadSession(scope.cache, { tripId: 7, target: { kind: 'stay', id: 13 } })
    );
    const file = new File(['original'], 'booking.pdf', { type: 'application/pdf' });
    original.addFiles([file]);
    expect(result.current({ targetKind: 'event', targetId: 13 })).not.toBe(original);
    expect(result.current({ targetKind: 'journey', targetId: 13 })).not.toBe(original);
    expect(result.current({ targetKind: 'rental', targetId: 13 })).toBeUndefined();
    rerender({ tripId: 8 });
    expect(result.current(target)).not.toBe(original);
    rerender({ tripId: 7 });
    expect(result.current(target)).toBe(original);
    expect(original.read()[0]?.file).toBe(file);
  });
  it('separates actual transport instances and origins without discarding older owner queues', () => {
    const first = createTripsClient({ baseUrl: 'https://trips.example' });
    const second = createTripsClient({ baseUrl: 'https://trips.example' });
    const documents = createClient({ baseUrl: 'https://documents.example' });
    const scope = ownerScope();
    const { result, rerender } = renderHook(
      ({ client }) => useArrangementDocuments({ ...base, client, documentsClient: documents }),
      { initialProps: { client: first }, wrapper: scope.wrapper }
    );
    const original = result.current(target);
    rerender({ client: second });
    expect(result.current(target)).not.toBe(original);
    rerender({ client: first });
    expect(result.current(target)).toBe(original);
    first.setConfig({ baseUrl: 'https://other-trips.example' });
    expect(result.current(target)).not.toBe(original);
    first.setConfig({ baseUrl: 'https://trips.example' });
    expect(result.current(target)).toBe(original);
    documents.setConfig({ baseUrl: 'https://other-documents.example' });
    expect(result.current(target)).not.toBe(original);
  });
});
