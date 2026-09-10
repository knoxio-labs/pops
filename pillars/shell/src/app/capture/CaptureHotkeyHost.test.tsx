import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActiveCaptureOverlay } from './capture-registry';

const mocks = vi.hoisted(() => ({
  useCaptureHotkey: vi.fn(),
  activeCaptureOverlay: vi.fn<() => ActiveCaptureOverlay | null>(),
}));

vi.mock('./useCaptureHotkey', () => ({
  useCaptureHotkey: (args: { key: string; enabled: boolean; onTrigger: () => void }) => {
    mocks.useCaptureHotkey(args);
  },
}));

vi.mock('./capture-registry', async () => {
  const actual = await vi.importActual<typeof import('./capture-registry')>('./capture-registry');
  return {
    ...actual,
    activeCaptureOverlay: () => mocks.activeCaptureOverlay(),
  };
});

vi.mock('./CaptureModal', () => ({
  CaptureModal: () => null,
}));

import { BootRegistryProvider } from '../BootRegistryProvider';
import { CaptureHotkeyHost } from './CaptureHotkeyHost';

import type { BootRegistry } from '../boot-snapshot';

/**
 * The host resolves its overlay from boot (POPS-3266), so it needs the
 * provider even where a test supplies an override — the hook runs either way.
 * Empty is right here: every case drives the override or asserts the
 * no-overlay path, and an empty registry keeps these about the hotkey
 * binding rather than the resolution behind it.
 */
const EMPTY_BOOT: BootRegistry = {
  manifests: [],
  registeredApps: [],
  remoteBundleUrls: [],
  bundleMap: {},
  source: 'registry',
};

function withBoot(ui: React.ReactElement) {
  return <BootRegistryProvider value={EMPTY_BOOT}>{ui}</BootRegistryProvider>;
}

const FakeMount = () => null;

function syntheticOverlay(hotkey: string | undefined): ActiveCaptureOverlay {
  return {
    pillarId: 'cerebrum',
    descriptor: {
      bundleSlot: 'ingest-form',
      order: 10,
      hotkey,
      labelKey: 'cerebrum.captureOverlay.label',
    },
    bundle: { Mount: FakeMount },
  };
}

describe('CaptureHotkeyHost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activeCaptureOverlay.mockReturnValue(null);
  });

  it('binds the descriptor hotkey when an overlay is registered', () => {
    render(withBoot(<CaptureHotkeyHost activeOverlayOverride={syntheticOverlay('cmd+shift+k')} />));
    expect(mocks.useCaptureHotkey).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: 'cmd+shift+k', enabled: true })
    );
  });

  it('keeps the hotkey unbound when no overlay is registered', () => {
    render(withBoot(<CaptureHotkeyHost activeOverlayOverride={null} />));
    expect(mocks.useCaptureHotkey).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: '', enabled: false })
    );
  });

  it('keeps the hotkey unbound when the descriptor declares no hotkey', () => {
    render(withBoot(<CaptureHotkeyHost activeOverlayOverride={syntheticOverlay(undefined)} />));
    expect(mocks.useCaptureHotkey).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: '', enabled: false })
    );
  });

  it('falls back to the live registry walk when no override is supplied', () => {
    mocks.activeCaptureOverlay.mockReturnValue(syntheticOverlay('cmd+shift+k'));
    render(withBoot(<CaptureHotkeyHost />));
    expect(mocks.useCaptureHotkey).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: 'cmd+shift+k', enabled: true })
    );
  });

  it('renders empty when the registry walk reports no overlay', () => {
    mocks.activeCaptureOverlay.mockReturnValue(null);
    render(withBoot(<CaptureHotkeyHost />));
    expect(mocks.useCaptureHotkey).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: '', enabled: false })
    );
  });
});
