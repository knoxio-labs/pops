import { BookmarkPlus, ChevronDown, ChevronRight } from 'lucide-react';

import { Button, ButtonPrimitive } from '@pops/ui';

import { describeTag } from '../../../lib/tags';
import { TagBadgeRow } from '../../tags/TagChip';
import { GroupTagBar } from './GroupTagBar';
import { TransactionTagRow } from './TransactionTagRow';
import { useEntityGroupState } from './useEntityGroupState';

import type { ConfirmedTransaction } from '@pops/finance';

import type { TagFacetOption } from '../../../lib/tags';
import type { ConfirmedGroup } from './tagReviewUtils';
import type { EntityGroupStateInput } from './useEntityGroupState';

export interface EntityGroupProps extends EntityGroupStateInput {
  availableTags: string[];
  facets: TagFacetOption[];
  onSaveTagRule: (group: ConfirmedGroup) => void;
  onSaveTagRuleForTransaction: (transaction: ConfirmedTransaction, tags: string[]) => void;
}

interface HeaderProps {
  group: ConfirmedGroup;
  expanded: boolean;
  currentUnion: string[];
  suggestedUnion: string[];
  onToggle: () => void;
  onApplySuggestions: () => void;
  onSaveTagRule: () => void;
}

function GroupHeader(props: HeaderProps) {
  const { group, expanded, currentUnion, suggestedUnion } = props;
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 bg-muted/40">
      <Button
        variant="ghost"
        size="sm"
        className="flex items-center gap-2 flex-1 justify-start text-left hover:bg-transparent"
        onClick={props.onToggle}
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
        )}
        <span className="font-medium text-sm">{group.entityName}</span>
        <span className="text-xs text-muted-foreground">({group.transactions.length})</span>
      </Button>
      <div className="flex items-center gap-2 flex-shrink-0">
        <CurrentTagsPreview currentUnion={currentUnion} />
        {suggestedUnion.length > 0 && (
          <ButtonPrimitive
            variant="outline"
            size="xs"
            onClick={props.onApplySuggestions}
            className="whitespace-nowrap"
            title={`Apply suggestions: ${suggestedUnion
              .map((tag) => describeTag(tag).ariaLabel)
              .join(', ')}`}
          >
            Apply suggestions
          </ButtonPrimitive>
        )}
        <ButtonPrimitive
          variant="ghost"
          size="xs"
          onClick={(e) => {
            e.stopPropagation();
            props.onSaveTagRule();
          }}
          className="whitespace-nowrap text-muted-foreground hover:text-foreground"
          title="Save a reusable tag rule for this group"
          aria-label={`Save tag rule for ${group.entityName}`}
        >
          <BookmarkPlus className="w-3.5 h-3.5 mr-1" />
          Save tag rule…
        </ButtonPrimitive>
      </div>
    </div>
  );
}

function CurrentTagsPreview({ currentUnion }: { currentUnion: string[] }) {
  if (currentUnion.length === 0) return null;
  return (
    <TagBadgeRow
      tags={currentUnion}
      limit={3}
      className="hidden sm:flex gap-1 flex-wrap max-w-48"
      badgeClassName="text-xs"
    />
  );
}

export function EntityGroup(props: EntityGroupProps) {
  const {
    group,
    localTags,
    suggestedTagMeta,
    availableTags,
    facets,
    onUpdateTag,
    onSaveTagRule,
    onSaveTagRuleForTransaction,
  } = props;
  const s = useEntityGroupState(props);

  return (
    <div className="border rounded-lg overflow-hidden">
      <GroupHeader
        group={group}
        expanded={s.expanded}
        currentUnion={s.currentUnion}
        suggestedUnion={s.suggestedUnion}
        onToggle={() => s.setExpanded((prev) => !prev)}
        onApplySuggestions={s.handleApplySuggestions}
        onSaveTagRule={() => onSaveTagRule(group)}
      />
      {s.expanded && (
        <>
          <GroupTagBar
            stagedTags={s.groupStagedTags}
            availableTags={availableTags}
            facets={facets}
            onAddTag={s.addGroupStagedTag}
            onRemoveTag={s.removeGroupStagedTag}
            onApply={s.handleApplyStagedToGroup}
          />
          <div className="divide-y">
            {group.transactions.map((t) => (
              <TransactionTagRow
                key={t.checksum}
                transaction={t}
                tags={localTags[t.checksum] ?? []}
                suggestedTagMeta={suggestedTagMeta[t.checksum] ?? []}
                availableTags={availableTags}
                facets={facets}
                onSave={(tags) => onUpdateTag(t.checksum, tags)}
                onSaveTagRule={onSaveTagRuleForTransaction}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
