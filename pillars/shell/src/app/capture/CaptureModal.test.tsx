import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import i18n from '../../i18n';
import { BootRegistryProvider } from '../BootRegistryProvider';
import { CaptureModal } from './CaptureModal';

import type { FC, ReactElement } from 'react';

import type { BootRegistry } from '../boot-snapshot';
import type { ActiveCaptureOverlay } from './capture-registry';

/**
 * The modal reads its overlay from boot (POPS-3266), so it needs the provider
 * even when a test supplies `activeOverlayOverride` — the hook runs either
 * way. An empty boot registry is right for these: every test here drives the
 * override, and leaving the registry empty keeps them asserting the modal's
 * own rendering rather than the resolution behind it, which
 * `capture-registry.test.ts` covers.
 */
const EMPTY_BOOT: BootRegistry = {
  manifests: [],
  registeredApps: [],
  remoteBundleUrls: [],
  bundleMap: {},
  source: 'registry',
};

function withI18n(ui: ReactElement) {
  return (
    <I18nextProvider i18n={i18n}>
      <BootRegistryProvider value={EMPTY_BOOT}>{ui}</BootRegistryProvider>
    </I18nextProvider>
  );
}

function syntheticOverlay(props: {
  hotkey?: string;
  labelKey?: string;
  label?: string;
  MountBody?: FC;
}): ActiveCaptureOverlay {
  const MountBody = props.MountBody ?? (() => <div data-testid="overlay-body">overlay body</div>);
  return {
    pillarId: 'cerebrum',
    descriptor: {
      bundleSlot: 'ingest-form',
      order: 10,
      hotkey: props.hotkey,
      labelKey: props.labelKey,
      label: props.label,
    },
    bundle: {
      Mount: ({ onUnsavedChange: _ }) => <MountBody />,
    },
  };
}

describe('CaptureModal', () => {
  it('renders the resolved bundle inside the dialog when open', () => {
    render(
      withI18n(
        <CaptureModal
          open
          onOpenChange={() => undefined}
          activeOverlayOverride={syntheticOverlay({})}
        />
      )
    );
    expect(screen.getByTestId('overlay-body')).toBeDefined();
  });

  it('renders the empty-state description when no overlay is registered', () => {
    render(
      withI18n(<CaptureModal open onOpenChange={() => undefined} activeOverlayOverride={null} />)
    );
    expect(screen.queryByTestId('overlay-body')).toBeNull();
    expect(screen.getByText(i18n.t('captureModal.empty', { ns: 'shell' }) as string)).toBeDefined();
  });

  it('titles the dialog from the descriptor labelKey', () => {
    render(
      withI18n(
        <CaptureModal
          open
          onOpenChange={() => undefined}
          activeOverlayOverride={syntheticOverlay({ labelKey: 'cerebrum.captureOverlay.label' })}
        />
      )
    );
    const expected = i18n.t('captureOverlay.label', { ns: 'cerebrum' }) as string;
    expect(screen.getByText(expected)).toBeDefined();
  });

  it('falls back to the descriptor label when labelKey is absent', () => {
    render(
      withI18n(
        <CaptureModal
          open
          onOpenChange={() => undefined}
          activeOverlayOverride={syntheticOverlay({ label: 'Quick capture' })}
        />
      )
    );
    expect(screen.getByText('Quick capture')).toBeDefined();
  });

  it('falls back to the generic shell title when neither labelKey nor label is set', () => {
    render(
      withI18n(
        <CaptureModal
          open
          onOpenChange={() => undefined}
          activeOverlayOverride={syntheticOverlay({})}
        />
      )
    );
    expect(screen.getByText(i18n.t('captureModal.title', { ns: 'shell' }) as string)).toBeDefined();
  });
});
