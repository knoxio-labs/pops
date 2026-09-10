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

import type { ComponentType } from 'react';

import type { AiPageSlot } from '@pops/ai/manifest';

export const bundles: Readonly<Record<AiPageSlot, ComponentType>> = PAGE_COMPONENTS;
