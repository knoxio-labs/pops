import type { OperatorGetDeviceGrantResponse } from '../../../bfm-api/index.js';

/** Canonical generated grant read, including unsupported stored strings. */
export type DeviceGrant = OperatorGetDeviceGrantResponse;
/** A capability accepted by the generated complete-replacement body. */
export type SelectableCapability = DeviceGrant['selectable'][number];

/** Uses the returned selectable catalogue to narrow a raw stored value without inventing vocabulary. */
export function isSelectable(grant: DeviceGrant, value: string): value is SelectableCapability {
  return grant.selectable.some((capability) => capability === value);
}

/** Computes the complete explicit selection and blocks loss of unavailable stored values. */
export function projectSelection(grant: DeviceGrant, selection: string[]) {
  const selected = [...new Set(selection)];
  const capabilities = selected.filter((value) => isSelectable(grant, value));
  const unavailable = [...new Set([...grant.stored, ...selected])].filter(
    (value) => !isSelectable(grant, value)
  );
  const added = selected.filter((value) => !grant.effective.includes(value));
  const removed = grant.effective.filter((value) => !selected.includes(value));
  return {
    capabilities,
    unavailable,
    added,
    removed,
    changed: grant.mode === 'tracks-default' || added.length > 0 || removed.length > 0,
  };
}

/** Starts from the resolved current grant, retaining stored strings that cannot safely be submitted. */
export function initialSelection(grant: DeviceGrant): string[] {
  return [
    ...new Set([
      ...grant.effective,
      ...grant.stored.filter((value) => !isSelectable(grant, value)),
    ]),
  ];
}
