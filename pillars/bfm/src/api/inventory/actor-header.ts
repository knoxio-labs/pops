/**
 * Building the `Pops-Actor` header inventory's `POST /sync/mutations` honours
 * (`pillars/inventory/src/api/sync/actor.ts`'s `parseActorHeader`): the
 * device the mutation batch should be recorded against.
 *
 * The label comes from the device row `requireDevice` resolved, never from
 * anything the phone put on this request — inventory trusts this header only
 * from a caller whose service account holds `inventory.sync`, and a phone
 * that could set its own label could attribute a mutation to any device.
 */
export function buildInventoryActorHeader(deviceId: string, label: string): string {
  return `device:${deviceId};label=${encodeURIComponent(label)}`;
}
