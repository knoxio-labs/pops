import { ChevronRight, Plus } from 'lucide-react';

import { ButtonPrimitive } from '@pops/ui';

import { PickerRow } from './picker-sections';

import type { PlacementTarget } from '../model/model';
import type { PickerModel } from './use-picker-state';

/** Props for {@link PickerTree}. */
export interface PickerTreeProps {
  model: PickerModel;
  onPick: (target: PlacementTarget) => void;
  onDrill: (locationId: string | null) => void;
}

function Crumbs({
  crumbs,
  onDrill,
}: Pick<PickerTreeProps, 'onDrill'> & { crumbs: PickerModel['crumbs'] }) {
  return (
    <nav aria-label="Place path" className="flex min-w-0 items-center gap-0.5 px-1 pb-1 text-xs">
      {crumbs.map((crumb, index) => {
        const last = index === crumbs.length - 1;
        return (
          <span key={crumb.id ?? 'root'} className="inline-flex min-w-0 items-center gap-0.5">
            {index > 0 ? (
              <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" aria-hidden />
            ) : null}
            {last ? (
              <span className="truncate px-1 font-medium text-foreground" aria-current="location">
                {crumb.name}
              </span>
            ) : (
              <ButtonPrimitive
                type="button"
                variant="ghost"
                size="xs"
                className="min-w-0 truncate px-1 text-muted-foreground"
                onClick={() => onDrill(crumb.id)}
              >
                {crumb.name}
              </ButtonPrimitive>
            )}
          </span>
        );
      })}
    </nav>
  );
}

/** Renders the current location level with breadcrumbs and direct containers. */
export function PickerTree({ model, onPick, onDrill }: PickerTreeProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Crumbs crumbs={model.crumbs} onDrill={onDrill} />
      <ul aria-label="Places here" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-1">
        {model.level.map((option) => (
          <PickerRow
            key={option.key}
            option={option}
            onPick={onPick}
            onDrill={onDrill}
            hideDetail
          />
        ))}
        {model.level.length === 0 ? (
          <li className="px-2 py-3 text-xs text-muted-foreground">
            Nothing inside this place yet.
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/** Renders the inline action for creating a place under the drilled location. */
export function CreatePlaceRow({
  create,
  onCreate,
}: {
  create: NonNullable<PickerModel['create']>;
  onCreate: (name: string, parentId: string | null) => void;
}) {
  return (
    <ButtonPrimitive
      type="button"
      variant="ghost"
      size="sm"
      className="h-9 w-full justify-start gap-2 px-2 font-normal"
      onClick={() => onCreate(create.name, create.parentId)}
    >
      <Plus className="size-4 text-muted-foreground" aria-hidden />
      <span>
        New place <span className="font-medium">“{create.name}”</span> in {create.parentName}
      </span>
    </ButtonPrimitive>
  );
}
