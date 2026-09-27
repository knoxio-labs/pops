import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const settingsListMock = vi.hoisted(() => vi.fn());

vi.mock('../inventory-api/index.js', () => ({
  settingsList: (...args: unknown[]) => settingsListMock(...args),
}));

import {
  DEFAULT_INVENTORY_DEFAULTS,
  labelTemplateForShows,
  parseInventoryDefaults,
  useInventoryDefaults,
} from './useInventoryDefaults.js';

import type { SettingsListResponses } from '../inventory-api/types.gen.js';

type Settings = SettingsListResponses[200]['data'];

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

function response(data: Settings) {
  return { data: { data }, error: undefined, response: { status: 200 } };
}

beforeEach(() => {
  vi.clearAllMocks();
  settingsListMock.mockResolvedValue(response([]));
});

describe('parseInventoryDefaults', () => {
  it('reads valid stored label and list defaults', () => {
    expect(
      parseInventoryDefaults([
        { key: 'inventory.labelSheet', value: 'L7165' },
        { key: 'inventory.labelShows', value: 'qr-code' },
        { key: 'inventory.density', value: 'comfortable' },
      ])
    ).toEqual({ labelSheet: 'L7165', labelShows: 'qr-code', density: 'comfortable' });
  });

  it('rejects unknown stored values independently', () => {
    expect(
      parseInventoryDefaults([
        { key: 'inventory.labelSheet', value: 'not-a-sheet' },
        { key: 'inventory.labelShows', value: 'not-a-preset' },
        { key: 'inventory.density', value: 'spacious' },
      ])
    ).toEqual(DEFAULT_INVENTORY_DEFAULTS);
  });

  it('keeps the contract defaults when settings are missing', () => {
    expect(parseInventoryDefaults([])).toEqual(DEFAULT_INVENTORY_DEFAULTS);
  });
});

describe('labelTemplateForShows', () => {
  it('maps stored presets to the label job choices without changing the job hook', () => {
    expect(labelTemplateForShows('auto')).toBe('auto');
    expect(labelTemplateForShows('qr-name-code')).toBe('container');
    expect(labelTemplateForShows('qr-code')).toBe('item');
    expect(labelTemplateForShows('contents')).toBe('auto');
  });
});

describe('useInventoryDefaults', () => {
  it('loads settings once through the shared query', async () => {
    settingsListMock.mockResolvedValue(
      response([
        { key: 'inventory.labelSheet', value: 'L7163' },
        { key: 'inventory.labelShows', value: 'qr-name-code' },
        { key: 'inventory.density', value: 'compact' },
      ])
    );

    const { result } = renderHook(() => useInventoryDefaults(), { wrapper });

    await waitFor(() =>
      expect(result.current.data).toEqual({
        labelSheet: 'L7163',
        labelShows: 'qr-name-code',
        density: 'compact',
      })
    );
    expect(settingsListMock).toHaveBeenCalledOnce();
  });

  it('surfaces an API failure without inventing a successful response', async () => {
    settingsListMock.mockRejectedValue(new Error('settings unavailable'));

    const { result } = renderHook(() => useInventoryDefaults(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
