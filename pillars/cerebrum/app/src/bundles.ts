/**
 * The `bundles` record the shell's runtime loader resolves against.
 *
 * `pillars/shell/src/app/external-ui.tsx` imports this pillar's remote ESM
 * entry and looks a slot up here: a `PageDescriptor.bundleSlot` for a route,
 * the manifest's `captureOverlay.bundleSlot` for the capture modal, and each
 * `topBarWidgets[].bundleSlot` for the top bar. A slot the record does not
 * carry is reported as a contract break at first use rather than mounting
 * nothing.
 *
 * The non-page surfaces sit beside the pages because a bundle carries every
 * surface the pillar contributes, keyed by slot, and the manifest — not this
 * record — says which slot plays which role.
 */
import { CEREBRUM_CAPTURE_SLOT, CEREBRUM_NUDGE_INDICATOR_SLOT } from '@pops/cerebrum/manifest';

import { IngestCaptureOverlay, type CaptureOverlayMountProps } from './capture-overlay';
import { NudgeIndicator } from './components/NudgeIndicator';
import { PAGE_COMPONENTS } from './routes';

import type { ComponentType } from 'react';

import type {
  CerebrumCaptureSlot,
  CerebrumNudgeIndicatorSlot,
  CerebrumPageSlot,
} from '@pops/cerebrum/manifest';

export const bundles: Readonly<
  Record<CerebrumPageSlot | CerebrumNudgeIndicatorSlot, ComponentType> &
    Record<CerebrumCaptureSlot, ComponentType<CaptureOverlayMountProps>>
> = {
  ...PAGE_COMPONENTS,
  [CEREBRUM_CAPTURE_SLOT]: IngestCaptureOverlay,
  [CEREBRUM_NUDGE_INDICATOR_SLOT]: NudgeIndicator,
};
