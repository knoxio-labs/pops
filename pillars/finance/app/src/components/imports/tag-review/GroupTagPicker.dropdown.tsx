/**
 * The dropdown content for `GroupTagPicker`'s combobox — the facet-grouped
 * vocabulary matches and the "which axis does this belong to?" creation row.
 * Split out from `GroupTagPicker.tsx` so that file's `PickerInput` (the
 * combobox itself) stays under the repo's function-length limit.
 */
import { CommandGroup, CommandItem } from '@pops/ui';

import {
  composeTag,
  describeTag,
  formatFacet,
  groupTagsByFacet,
  parseTag,
  type TagCreationIntent,
} from '../../../lib/tags';
import { FacetHeading } from '../../tags/TagChip';

function PickerOption({ tag, onPick }: { tag: string; onPick: (tag: string) => void }) {
  const { label, ariaLabel, title } = describeTag(tag);
  return (
    <CommandItem
      value={tag}
      onSelect={() => onPick(tag)}
      title={title}
      aria-label={ariaLabel}
      data-tag={tag}
      className="min-h-11 min-w-11 justify-start rounded-none px-3 py-1 text-xs data-[selected=true]:bg-accent"
    >
      {label}
    </CommandItem>
  );
}

export function PickerOptions({
  filtered,
  onPick,
}: {
  filtered: string[];
  onPick: (tag: string) => void;
}) {
  return (
    <>
      {groupTagsByFacet(filtered).map((group) => (
        <CommandGroup
          key={group.label}
          heading={
            <FacetHeading className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold px-3 pt-1.5 pb-0.5">
              {group.label}
            </FacetHeading>
          }
          className="p-0"
        >
          {group.tags.map((parsed) => (
            <PickerOption key={parsed.raw} tag={parsed.raw} onPick={onPick} />
          ))}
        </CommandGroup>
      ))}
    </>
  );
}

/** The single "create <value> as <facet>" option a `ready` or `choose` intent offers. */
function CreateOption({ tag, onPick }: { tag: string; onPick: (tag: string) => void }) {
  const { parsed, style } = describeTag(tag);
  return (
    <CommandItem
      value={tag}
      onSelect={() => onPick(tag)}
      aria-label={`Create ${tag}`}
      data-create-tag={tag}
      style={style}
      className="min-h-11 w-fit rounded-full px-3 text-xs hover:brightness-110 data-[selected=true]:brightness-110"
    >
      + {formatFacet(parsed.facet)}
    </CommandItem>
  );
}

/**
 * The "which axis does this belong to?" row, or the explanation for why none
 * is offered. Rendered as plain `CommandItem`s (no enclosing group) so arrow
 * navigation flows straight from the vocabulary matches above into these.
 */
export function PickerCreation({
  creation,
  onPick,
}: {
  creation: TagCreationIntent;
  onPick: (tag: string) => void;
}) {
  if (creation.kind === 'none') return null;
  if (creation.kind === 'refused') {
    return (
      <div className="border-t px-3 py-1.5 first:border-t-0">
        <p className="text-2xs text-muted-foreground">
          {formatFacet(creation.facet)} is{' '}
          {creation.facetKind === 'closed'
            ? 'a fixed set — pick one of its listed values.'
            : 'set by the system — it cannot be added by hand.'}
        </p>
      </div>
    );
  }
  const tags =
    creation.kind === 'ready'
      ? [creation.tag]
      : creation.facets.map((facet) => composeTag(facet, creation.value));
  const value = creation.kind === 'ready' ? parseTag(creation.tag).value : creation.value;
  return (
    <div className="space-y-1 border-t px-3 py-1.5 first:border-t-0">
      <p className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">
        Create “{value}” as
      </p>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <CreateOption key={tag} tag={tag} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}
