import { useTranslation } from 'react-i18next';

import { PeopleWorkspace } from '@pops/trips-workspace';

import type { PeopleWorkspaceProps } from '@pops/trips-workspace';

/** Timeline-owned trip identity and opaque owner integrations for canonical meeting commands. */
export type PeopleContextProps = Pick<PeopleWorkspaceProps, 'tripId' | 'contacts' | 'client'>;

/** Render canonical meeting plans inside the owning Trip context without a route dependency. */
export function PeopleContext(props: PeopleContextProps) {
  const { t } = useTranslation('trips');
  return <PeopleWorkspace {...props} text={(key, values) => t(`people.${key}`, values)} />;
}
