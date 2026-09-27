/**
 * The `bundles` record the shell's runtime loader resolves against.
 *
 * `pillars/shell/src/app/external-ui.tsx` imports this pillar's remote ESM
 * entry and looks each `PageDescriptor.bundleSlot` up here; a slot the record
 * does not carry is reported as a contract break at first navigation rather
 * than mounting nothing.
 *
 * It is `PAGE_COMPONENTS` under the name the wire contract uses, not a second
 * table, so both mount paths resolve a page to the same component.
 */
import { PAGE_COMPONENTS } from './routes';
import { PaperlessWidget } from './settings/paperless-widget';

import type { ComponentType } from 'react';

import type { InventoryPageSlot } from '@pops/inventory/manifest';

/** The settings widget slots supplied by the Inventory remote bundle. */
export const settingsWidgetBundles = {
  'inventory-paperless': PaperlessWidget,
} satisfies Readonly<Record<string, ComponentType>>;

/** The page and settings components the shell resolves by manifest slot. */
export const bundles: Readonly<
  Record<InventoryPageSlot, ComponentType> & Readonly<Record<string, ComponentType>>
> = {
  ...PAGE_COMPONENTS,
  ...settingsWidgetBundles,
};
