import { useParams } from 'react-router';

import { personGateway } from '../person/api';
import { PersonPanel } from '../person/PersonPanel';

/** Open the Contacts-owned person record using its stable fleet identity. */
export function PersonPage() {
  const { personId = '' } = useParams<{ personId: string }>();
  return <PersonPanel key={personId} id={personId} gateway={personGateway} />;
}
