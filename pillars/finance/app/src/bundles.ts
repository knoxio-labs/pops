/**
 * The `bundles` record the shell's runtime loader resolves against.
 *
 * `pillars/shell/src/app/external-ui.tsx` imports this pillar's remote ESM
 * entry and looks each `PageDescriptor.bundleSlot` up here; a slot the record
 * does not carry is reported as a contract break at first navigation rather
 * than mounting nothing.
 *
 * It is `PAGE_COMPONENTS` under the name the wire contract uses, not a second
 * table: the static bundle map mounts `routes`, which is held in step with the
 * same map, so both mount paths resolve a page to the same component.
 */
import { PAGE_COMPONENTS } from './routes';

import type { ComponentType } from 'react';

import type { FinancePageSlot } from '@pops/finance/manifest';

export const bundles: Readonly<Record<FinancePageSlot, ComponentType>> = PAGE_COMPONENTS;
