import { type VocabularyTag, vocabularyTags } from '@/fixtures/tags';
import { TagMerchantList, TagName, TagRuleList } from '@/kit/tag-sources';
import { useState } from 'react';

import { Button, Card, cn, PageHeader } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Tags', order: 9, frame: 'web' };

function TagList({
  tags,
  selected,
  onSelect,
}: {
  tags: VocabularyTag[];
  selected: string | null;
  onSelect: (tag: string) => void;
}) {
  return (
    <ul className="divide-y divide-border rounded-lg border">
      {tags.map((tag) => (
        <li key={tag.tag}>
          <Button
            variant="ghost"
            aria-current={selected === tag.tag ? 'true' : undefined}
            onClick={() => onSelect(tag.tag)}
            className={cn(
              'w-full justify-between rounded-none px-4',
              selected === tag.tag && 'bg-muted'
            )}
          >
            <TagName tag={tag.tag} />
            <span className="text-xs tabular-nums text-muted-foreground">
              {tag.transactionCount}
            </span>
          </Button>
        </li>
      ))}
    </ul>
  );
}

function TagDetail({ tag }: { tag: VocabularyTag | undefined }) {
  if (!tag) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">Pick a tag to see what applies it.</p>
      </Card>
    );
  }
  return (
    <Card className="space-y-6 p-6">
      <div className="space-y-1">
        <TagName tag={tag.tag} />
        <p className="text-sm text-muted-foreground">
          {tag.transactionCount} {tag.transactionCount === 1 ? 'transaction' : 'transactions'}
        </p>
      </div>
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Rules
        </h3>
        <TagRuleList rules={tag.rules} />
      </section>
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Merchant defaults
        </h3>
        <TagMerchantList merchants={tag.merchants} />
      </section>
    </Card>
  );
}

function TagsPage({
  tags,
  initiallySelected,
}: {
  tags: VocabularyTag[];
  initiallySelected: string | null;
}) {
  const [selected, setSelected] = useState<string | null>(initiallySelected);
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <PageHeader
        title="Tags"
        description="Every tag in the vocabulary, how often it is used, and what applies it"
      />
      {tags.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tags in the vocabulary yet.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <TagList tags={tags} selected={selected} onSelect={setSelected} />
          </div>
          <div className="lg:col-span-2">
            <TagDetail tag={tags.find((tag) => tag.tag === selected)} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function TagsScreen() {
  return <TagsPage tags={vocabularyTags} initiallySelected={vocabularyTags[0]?.tag ?? null} />;
}

export const states: ScreenStates = {
  empty: () => <TagsPage tags={[]} initiallySelected={null} />,
  'nothing-selected': () => <TagsPage tags={vocabularyTags} initiallySelected={null} />,
};
