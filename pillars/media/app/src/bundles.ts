/**
 * The `bundles` record the shell's runtime loader resolves against.
 *
 * `pillars/shell/src/app/external-ui.tsx` imports this pillar's remote ESM
 * entry and looks a slot up here: a `PageDescriptor.bundleSlot` for a route,
 * and a settings group's `widget.bundleSlot` for a custom panel. A slot the
 * record does not carry is reported as a contract break at first use rather
 * than mounting nothing.
 *
 * The widgets sit beside the pages because a bundle carries every surface the
 * pillar contributes, keyed by slot, and the manifests — not this record —
 * say which slot plays which role.
 */
import { PlexConnectPanel } from './components/plex-connect/PlexConnectPanel';
import { RotationTuningPanel } from './components/rotation-tuning/RotationTuningPanel';
import { PAGE_COMPONENTS } from './routes';

import type { ComponentType } from 'react';

import type { MediaPageSlot, MediaSettingsWidgetSlot } from '@pops/media/manifest';

export const bundles: Readonly<
  Record<MediaPageSlot, ComponentType> & Record<MediaSettingsWidgetSlot, ComponentType>
> = {
  ...PAGE_COMPONENTS,
  'plex-connect': PlexConnectPanel,
  'rotation-tuning': RotationTuningPanel,
};
