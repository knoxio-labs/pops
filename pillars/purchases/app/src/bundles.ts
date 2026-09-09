/**
 * The `bundles` record the shell's runtime loader resolves against.
 *
 * `pillars/shell/src/app/external-ui.tsx` imports a pillar's remote ESM entry
 * and looks each `PageDescriptor.bundleSlot` up in this record; a slot the
 * record does not carry is reported as a contract break at first navigation
 * rather than mounting nothing. Until this existed every slot purchases
 * declared named something nothing could resolve (POPS-2351).
 *
 * It is `PAGE_COMPONENTS` under the name the wire contract uses, not a second
 * table: the shell's static bundle map mounts `routes`, which is derived from
 * the same map, so the two mount paths resolve a page to the same component
 * by construction. A slot with no component behind it is a compile error at
 * that declaration rather than a blank page in production.
 */
import { PAGE_COMPONENTS } from './routes';

import type { ComponentType } from 'react';

import type { PurchasesPageSlot } from '@pops/purchases/manifest';

export const bundles: Readonly<Record<PurchasesPageSlot, ComponentType>> = PAGE_COMPONENTS;
