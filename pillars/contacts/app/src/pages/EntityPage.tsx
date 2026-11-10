import { useParams } from 'react-router';

import { EntityPanel } from '../entity/EntityPanel';

/** Open a company or organisation record by its stable Contacts identity. */
export function EntityPage() {
  const { entityId = '' } = useParams<{ entityId: string }>();
  return <EntityPanel key={entityId} id={entityId} />;
}
