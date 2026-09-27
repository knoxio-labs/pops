import { Edit3 } from 'lucide-react';

import { Button } from '@pops/ui';

import { fixtureKindLabel, FixtureMark } from './fixture-kinds.js';
import { fixtureRoomPath } from './fixture-model.js';

import type { ReactElement } from 'react';

import type { LocationModel } from '../../foundation/model/model.js';
import type { FixtureDetail } from './fixture-model.js';

/** Props for the facts rail on a fixture detail page. */
export interface FixtureFactsProps {
  readonly fixture: FixtureDetail;
  readonly locations: readonly LocationModel[];
  readonly onEdit: () => void;
  readonly editDisabledReason?: string;
}

/** Renders the fixture identity, room, notes, timestamps, and edit action. */
export function FixtureFacts(props: FixtureFactsProps): ReactElement {
  const locationMap = new Map(props.locations.map((location) => [location.id, location] as const));
  return (
    <aside
      aria-label="Fixture facts"
      className="flex w-full shrink-0 flex-col gap-4 rounded-xl border bg-card p-4 lg:w-72"
    >
      <div className="flex items-start gap-3">
        <FixtureMark kind={props.fixture.type} size="md" />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{props.fixture.name}</p>
          <p className="text-sm text-muted-foreground">{fixtureKindLabel(props.fixture.type)}</p>
        </div>
      </div>
      <dl className="grid gap-3 text-sm">
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Built into</dt>
          <dd>{fixtureRoomPath(locationMap, props.fixture.locationId)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Note</dt>
          <dd className={props.fixture.notes === null ? 'text-muted-foreground' : undefined}>
            {props.fixture.notes ?? 'No note recorded'}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Recorded</dt>
          <dd>{new Date(props.fixture.createdAt).toLocaleDateString()}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Last edited</dt>
          <dd>{new Date(props.fixture.lastEditedTime).toLocaleDateString()}</dd>
        </div>
      </dl>
      <Button
        variant="outline"
        disabled={props.editDisabledReason !== undefined}
        aria-disabled={props.editDisabledReason !== undefined || undefined}
        onClick={props.editDisabledReason === undefined ? props.onEdit : undefined}
        prefix={<Edit3 className="size-4" aria-hidden />}
        title={props.editDisabledReason}
      >
        Edit fixture
      </Button>
    </aside>
  );
}
