import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  reloadRequired,
  reportResponse,
  resetInterruption,
  useInterruption,
} from './interruption-store';

function response(status: number, url: string): { status: number; url: string } {
  return { status, url };
}

beforeEach(() => {
  resetInterruption();
});

describe('interruption store', () => {
  it('records reload-required for 426', () => {
    reportResponse(response(426, '/inventory-api/sync/mutations'));

    expect(reloadRequired()).toBe(true);
    expect(renderHook(() => useInterruption()).result.current).toBe('reload-required');
  });

  it('a 401 before any catalogue read succeeded records nothing', () => {
    reportResponse(response(401, '/inventory-api/type-catalogue'));

    expect(reloadRequired()).toBe(false);
    expect(renderHook(() => useInterruption()).result.current).toBeNull();
  });

  it('a 401 after a successful catalogue read records session-expired', () => {
    reportResponse(response(200, '/inventory-api/type-catalogue'));
    reportResponse(response(401, '/inventory-api/type-catalogue'));

    expect(renderHook(() => useInterruption()).result.current).toBe('session-expired');
  });

  it('a success from a route outside type-catalogue confirms no session', () => {
    reportResponse(response(200, '/inventory-api/web/items'));
    reportResponse(response(401, '/inventory-api/type-catalogue'));

    expect(renderHook(() => useInterruption()).result.current).toBeNull();
  });

  it('ignores every other status and undefined', () => {
    [200, 201, 400, 403, 404, 409, 500, 503].forEach((status) => {
      reportResponse(response(status, '/inventory-api/web/items'));
    });
    reportResponse(undefined);

    expect(reloadRequired()).toBe(false);
    expect(renderHook(() => useInterruption()).result.current).toBeNull();
  });

  it('keeps session-expired when a 426 follows it', () => {
    reportResponse(response(200, '/inventory-api/type-catalogue'));
    reportResponse(response(401, '/inventory-api/type-catalogue'));
    reportResponse(response(426, '/inventory-api/sync/mutations'));

    expect(reloadRequired()).toBe(true);
    expect(renderHook(() => useInterruption()).result.current).toBe('session-expired');
  });

  it('reloadRequired stays true when a 401 follows a 426 and is false after a 401 alone', () => {
    reportResponse(response(426, '/inventory-api/sync/mutations'));
    reportResponse(response(401, '/inventory-api/type-catalogue'));
    expect(reloadRequired()).toBe(true);

    resetInterruption();
    reportResponse(response(401, '/inventory-api/type-catalogue'));
    expect(reloadRequired()).toBe(false);
  });

  it('resetInterruption clears the record and the confirmed session', () => {
    reportResponse(response(200, '/inventory-api/type-catalogue'));
    reportResponse(response(426, '/inventory-api/sync/mutations'));
    resetInterruption();
    reportResponse(response(401, '/inventory-api/type-catalogue'));

    expect(reloadRequired()).toBe(false);
    expect(renderHook(() => useInterruption()).result.current).toBeNull();
  });

  it('useInterruption re-renders when the record changes', () => {
    const { result } = renderHook(() => useInterruption());

    expect(result.current).toBeNull();
    act(() => {
      reportResponse(response(426, '/inventory-api/sync/mutations'));
    });

    expect(result.current).toBe('reload-required');
  });
});
