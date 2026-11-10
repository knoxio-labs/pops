import { ContactError } from '../errors';

import type {
  Address,
  ContactPoint,
  ContactPointInput,
  FactsSnapshot,
} from '../contacts-api/types.gen';

/** Editable method identity stays attached to the exact observation selected by the user. */
export interface PointDraft extends ContactPointInput {
  id: string;
}

/** Literal address fields never infer a place identity or parse address text. */
export interface AddressDraft {
  id: string;
  value: string;
  label: string;
  city: string;
}

/** One shared draft for every supported global person detail. */
export interface PersonDraft {
  name: string;
  notes: string;
  points: PointDraft[];
  addresses: AddressDraft[];
}

/** Published kinds remain distinct; Other is opaque text and URL remains URL. */
export const pointKinds = ['email', 'phone', 'social', 'url', 'other'] as const;

/** Reject an unsupported observation kind rather than silently relabeling its value. */
export function pointDraft(point: ContactPoint): PointDraft {
  const kind = pointKinds.find((kind) => kind === point.kind);
  if (!kind) throw new ContactError('invalidResponse', 'contacts.person.point_kind');
  return {
    id: point.id,
    kind,
    value: point.value,
    label: point.label ?? '',
    countryCode: point.countryCode ?? '',
  };
}

/** Preserve optional address metadata as literal editable strings. */
export function addressDraft(address: Address): AddressDraft {
  return {
    id: address.id,
    value: address.value,
    label: address.label ?? '',
    city: address.city ?? '',
  };
}

/** Project an acknowledged snapshot to an isolated draft without discarding source observations. */
export function personDraft(data: FactsSnapshot): PersonDraft {
  return {
    name: data.entity.name,
    notes: data.entity.notes ?? '',
    points: data.points.map(pointDraft),
    addresses: data.addresses.map(addressDraft),
  };
}
