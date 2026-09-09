/**
 * Workspace bundle map — single source enumerating in-repo pillar ids in the
 * shell.
 *
 * The shell discovers each in-repo pillar's UI surface (nav + pages +
 * capture overlay) by walking this map. For external pillars the registry
 * advertises an `assetsBaseUrl` and the wire-shaped `nav` / `pages`
 * descriptors; those never appear in this map (ADR-002 keeps the in-repo FE
 * a single static SPA). They reach the shell through the runtime loader in
 * `external-ui.tsx`, which lazy-`import()`s the remote bundle (Option A).
 *
 * Each entry carries:
 *
 *   - `manifest`              — the frontend `ModuleManifest` re-exported
 *                               by the pillar's `@pops/app-*` workspace
 *                               package. Provides `frontend.routes`
 *                               (lazy `RouteObject[]`), `navConfig`, and the
 *                               `frontend.captureOverlay` descriptor.
 *                               Bound by static import because the
 *                               current shell consumer surface is
 *                               synchronous.
 *   - `navOrder`              — mirrors `nav.order` from the pillar's
 *                               wire-format manifest payload
 *                               (`pillars/<id>/src/api/manifest.ts`).
 *                               Values follow a sparse scheme (finance=10,
 *                               purchases=15, media=20, inventory=30,
 *                               food=40, lists=50, cerebrum=60, ai=70,
 *                               bfm=80) so the app rail renders every pillar
 *                               in that order, whichever of the two routes
 *                               it arrives by — a loader-mounted pillar
 *                               carries the same number on its wire `nav`.
 *                               The gaps are the point: purchases took 15 to
 *                               sit beside finance, which it reconciles
 *                               against, without renumbering everything
 *                               after it.
 *   - `captureOverlayBundles` — kebab-case bundle slot → component +
 *                               (optional) hook reference. The shell's
 *                               `CaptureModal` resolves
 *                               `manifest.frontend.captureOverlay.bundleSlot`
 *                               through this record to obtain the React
 *                               component to mount. Cerebrum binds
 *                               `'ingest-form'` to its `IngestForm` +
 *                               `useIngestPageModel`.
 *   - `assetsBaseUrl?`        — set only for synthesized external-pillar
 *                               entries (`external-ui.tsx`); echoed for
 *                               diagnostics. Always `undefined` for the
 *                               in-repo entries declared in this file.
 *
 * Adding a new in-repo pillar = adding one entry here. External pillars
 * never appear in this map; they reach the shell via the registry walk and
 * the asset-URL loading path in `external-ui.tsx`.
 *
 * **No pillar is in this map any more, and that is not an omission**
 * (POPS-3217, POPS-3219 through POPS-3226). Every one of them reaches the
 * shell the way an out-of-tree pillar does: its wire manifest advertises
 * `assetsBaseUrl` and `pages`, and the runtime loader imports its built
 * bundle. Only `ego` remains: it declares `surfaces: ['overlay', 'app']` but
 * carries no `frontend.routes`, so it is a shell-hosted overlay rather than a
 * pillar with pages of its own. POPS-3227 removes the map itself.
 * They reach the shell the way an out-of-tree pillar does: the wire manifest advertises `assetsBaseUrl` and `pages`, and the
 * runtime loader imports its built bundle. The shell's build therefore knows
 * nothing about `@pops/app-purchases` — the package is not a dependency of
 * this one any more, which is the coupling, rather than the import line being
 * the coupling. `scripts/check-bundle-map-coverage.mjs` accepts either
 * arrangement per pillar and refuses a pillar that is in neither.
 *
 * One consequence is worth stating where the map is, rather than where the
 * loader is: `staticFloorEntries()` in `installed-modules.ts` derives the
 * registry-outage floor from THIS map, so a pillar that leaves it also leaves
 * the floor. With the registry unreachable the shell still boots and still
 * mounts every pillar left here — purchases is simply absent until the
 * registry answers, which is the same condition under which its own API is
 * undiscoverable.
 */
import { manifest as egoManifest } from '@pops/overlay-ego';

import type { ComponentType } from 'react';

import type { ModuleManifest } from '@pops/types';

/**
 * Props the shell passes to every capture-overlay `Mount` component.
 * `onUnsavedChange` flips whenever the bundle's unsaved-state changes
 * so the shell can gate Esc / backdrop close gestures without having to
 * peek inside bundle-local React state. Bundles that have no notion of
 * "unsaved content" simply never call the callback (the modal then
 * always permits close).
 */
export interface CaptureOverlayMountProps {
  readonly onUnsavedChange: (hasUnsaved: boolean) => void;
}

/**
 * One capture-overlay binding. The shell mounts `<Mount />` — a
 * zero-config wrapper a bundle owns that internally invokes its hook
 * and threads the model into its component. The wrapper shape lets each
 * pillar choose its own component / hook contract (cerebrum's
 * `<IngestForm model={useIngestPageModel()} />` shape included) without
 * leaking model types up to the shell.
 */
export interface CaptureOverlayBundle {
  readonly Mount: ComponentType<CaptureOverlayMountProps>;
}

export interface BundleEntry {
  readonly manifest: ModuleManifest;
  readonly navOrder: number;
  readonly captureOverlayBundles?: Readonly<Record<string, CaptureOverlayBundle>>;
  /**
   * Kebab-case settings-widget slot -> component, resolved by
   * `settings-widget-registry` for groups whose manifest names a
   * `widget.bundleSlot`. Media binds `'plex-connect'` to its
   * `PlexConnectPanel`.
   */
  readonly settingsWidgetBundles?: Readonly<Record<string, ComponentType>>;
  readonly assetsBaseUrl?: string;
}

export const WORKSPACE_BUNDLE_MAP: Readonly<Record<string, BundleEntry>> = {
  ego: { manifest: egoManifest, navOrder: Number.POSITIVE_INFINITY },
};

export function lookupBundleEntry(pillarId: string): BundleEntry | undefined {
  return WORKSPACE_BUNDLE_MAP[pillarId];
}
