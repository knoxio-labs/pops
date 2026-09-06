import { entitiesById, type Entity } from '@/fixtures/entities';
import { EntityActivity } from '@/kit/entity-activity';
import { EntityFieldList } from '@/kit/entity-fields';
import { EntityFormDialog } from '@/kit/entity-form';
import { EntityProfileHeader } from '@/kit/entity-header';
import { useEntityDialog } from '@/kit/use-entity-dialog';
import { Pencil } from 'lucide-react';

import { Button, Card, CardContent, EmptyState } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Entity details', order: 1, frame: 'web' };

function EntityDetailScreen({ entity }: { entity: Entity }) {
  const dialog = useEntityDialog();
  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <div className="relative">
        <Card className="overflow-hidden pt-0">
          <EntityProfileHeader entity={entity} />
          <CardContent className="pt-4">
            <EntityFieldList entity={entity} />
          </CardContent>
        </Card>
        <Button
          size="sm"
          variant="outline"
          className="absolute top-3 right-3 bg-background/80 backdrop-blur"
          onClick={() => dialog.openWith(entity)}
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
      </div>
      <EntityActivity entity={entity} />
      <EntityFormDialog
        key={dialog.key}
        open={dialog.open}
        onOpenChange={dialog.setOpen}
        entity={dialog.entity}
      />
    </div>
  );
}

const detail = (id: string) => () => {
  const entity = entitiesById.get(id);
  if (!entity) return <EmptyState title="No such entity" />;
  return <EntityDetailScreen entity={entity} />;
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
