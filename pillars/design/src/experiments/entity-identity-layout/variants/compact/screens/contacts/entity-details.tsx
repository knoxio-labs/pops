import { entitiesById } from '@/fixtures/entities';
import { EntityActivity } from '@/kit/entity-activity';
import { EntityFieldList } from '@/kit/entity-fields';
import { EntityCompactHeader } from '@/kit/entity-header';

import { Card, CardContent, EmptyState } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Entity details', order: 1, frame: 'web' };

const detail = (id: string) => () => {
  const entity = entitiesById.get(id);
  if (!entity) return <EmptyState title="No such entity" />;
  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <EntityCompactHeader entity={entity} />
      <Card>
        <CardContent className="pt-6">
          <EntityFieldList entity={entity} />
        </CardContent>
      </Card>
      <EntityActivity entity={entity} />
    </div>
  );
};

export const states: ScreenStates = {
  'all-three': detail('e1'),
  'avatar-and-colour': detail('e2'),
  'poster-and-colour': detail('e3'),
  'colour-only': detail('e5'),
  'nothing-assigned': detail('e6'),
  'avatar-only-legacy': detail('e9'),
  'poster-only': detail('e10'),
};

export default detail('e1');
