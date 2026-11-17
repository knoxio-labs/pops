import { z } from 'zod';

import { DEVICE_CAPABILITY_MODES, MOBILE_CAPABILITIES } from './capabilities.js';

const RevisionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const PolicyTokenSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const SelectionSchema = z
  .array(z.enum(MOBILE_CAPABILITIES))
  .refine((values) => new Set(values).size === values.length, 'Capabilities must be unique');

/** Human-only grant editor state; unknown stored strings remain visible, never silently dropped. */
export const DeviceGrantSchema = z
  .object({
    id: z.string().min(1),
    revision: RevisionSchema,
    policyToken: PolicyTokenSchema,
    mode: z.enum(DEVICE_CAPABILITY_MODES),
    stored: z.array(z.string()),
    effective: z.array(z.string()),
    selectable: z.array(z.enum(MOBILE_CAPABILITIES)),
  })
  .strict();

/** Complete explicit selection against an exact device revision and currently published policy. */
export const ReplaceDeviceGrantSchema = z
  .object({
    expectedRevision: RevisionSchema,
    expectedPolicyToken: PolicyTokenSchema,
    capabilities: SelectionSchema,
  })
  .strict();

/** Published, secret-free grant state for one operator-owned paired device. */
export type DeviceGrant = z.infer<typeof DeviceGrantSchema>;
/** Complete selection; omission never means default, merge, or implicit permission. */
export type ReplaceDeviceGrant = z.infer<typeof ReplaceDeviceGrantSchema>;
