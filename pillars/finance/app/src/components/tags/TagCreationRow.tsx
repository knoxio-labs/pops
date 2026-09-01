/**
 * The "which axis does this belong to?" row every tag picker shows once the
 * typed text names no existing tag.
 *
 * Shared rather than written twice because the two pickers that mint tags —
 * the per-transaction popover and the group bar — must offer the same axes and
 * refuse the same ones. A tag created on one screen is read on every other.
 */
import { Button } from '@pops/ui';

import {
  composeTag,
  describeTag,
  formatFacet,
  parseTag,
  type TagCreationIntent,
} from '../../lib/tags';

interface TagCreationRowProps {
  creation: TagCreationIntent;
  onAddTag: (tag: string) => void;
}

function CreateButton({ tag, onAddTag }: { tag: string; onAddTag: (tag: string) => void }) {
  const { parsed, style } = describeTag(tag);
  return (
    <Button
      variant="outline"
      size="sm"
      className="rounded-full text-xs h-7 px-3 hover:brightness-110"
      style={style}
      onClick={() => onAddTag(tag)}
      aria-label={`Create ${tag}`}
      data-create-tag={tag}
    >
      + {formatFacet(parsed.facet)}
    </Button>
  );
}

export function TagCreationRow({ creation, onAddTag }: TagCreationRowProps) {
  if (creation.kind === 'none') return null;
  if (creation.kind === 'refused') {
    return (
      <p className="text-2xs text-muted-foreground">
        {formatFacet(creation.facet)} is{' '}
        {creation.facetKind === 'closed'
          ? 'a fixed set — pick one of its listed values.'
          : 'set by the system — it cannot be added by hand.'}
      </p>
    );
  }
  const tags =
    creation.kind === 'ready'
      ? [creation.tag]
      : creation.facets.map((facet) => composeTag(facet, creation.value));
  const value = creation.kind === 'ready' ? parseTag(creation.tag).value : creation.value;
  return (
    <div className="space-y-1">
      <p className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">
        Create “{value}” as
      </p>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <CreateButton key={tag} tag={tag} onAddTag={onAddTag} />
        ))}
      </div>
    </div>
  );
}
