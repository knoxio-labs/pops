/**
 * The `bundles` record the shell's runtime loader resolves against.
 *
 * `pillars/shell/src/app/external-ui.tsx` imports this pillar's remote ESM
 * entry and looks a slot up here: a `PageDescriptor.bundleSlot` for a route,
 * and the manifest's `captureOverlay.bundleSlot` for the capture modal. A
 * slot the record does not carry is reported as a contract break at first
 * use rather than mounting nothing.
 *
 * The overlay sits beside the pages because a bundle carries every surface
 * the pillar contributes, keyed by slot, and the manifest — not this record —
 * says which slot plays which role.
 */
import { CEREBRUM_CAPTURE_SLOT } from '@pops/cerebrum/manifest';

import { IngestCaptureOverlay, type CaptureOverlayMountProps } from './capture-overlay';
import { PAGE_COMPONENTS } from './routes';

import type { ComponentType } from 'react';

import type { CerebrumCaptureSlot, CerebrumPageSlot } from '@pops/cerebrum/manifest';

export const bundles: Readonly<
  Record<CerebrumPageSlot, ComponentType> &
    Record<CerebrumCaptureSlot, ComponentType<CaptureOverlayMountProps>>
> = {
  ...PAGE_COMPONENTS,
  [CEREBRUM_CAPTURE_SLOT]: IngestCaptureOverlay,
};
