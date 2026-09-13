import { type VocabularyTag, vocabularyTags } from '@/fixtures/tags';
import { TagMerchantList, TagName, TagRuleList } from '@/kit/tag-sources';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Fragment, useState } from 'react';

import { Button, PageHeader } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Tags', order: 9, frame: 'web' };

function TagSources({ tag }: { tag: VocabularyTag }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
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
    </div>
  );
}

function TagRow({
  tag,
  open,
  onToggle,
}: {
  tag: VocabularyTag;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Fragment>
      <tr>
        <td className="px-2 py-1">
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={open}
            onClick={onToggle}
            className="gap-2"
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <TagName tag={tag.tag} />
          </Button>
        </td>
        <td className="px-4 py-2 text-right tabular-nums">{tag.transactionCount}</td>
        <td className="px-4 py-2 text-right tabular-nums">{tag.rules.length}</td>
        <td className="px-4 py-2 text-right tabular-nums">{tag.merchants.length}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={4} className="bg-muted/30 px-6 py-4">
            <TagSources tag={tag} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function TagsTable({
  tags,
  initiallyExpanded,
}: {
  tags: VocabularyTag[];
  initiallyExpanded?: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(initiallyExpanded ?? null);
  if (tags.length === 0) {
    return <p className="text-sm text-muted-foreground">No tags in the vocabulary yet.</p>;
  }
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Tag</th>
              <th className="px-4 py-2 text-right font-medium">Transactions</th>
              <th className="px-4 py-2 text-right font-medium">Rules</th>
              <th className="px-4 py-2 text-right font-medium">Merchant defaults</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {tags.map((tag) => (
              <TagRow
                key={tag.tag}
                tag={tag}
                open={expanded === tag.tag}
                onToggle={() => setExpanded(expanded === tag.tag ? null : tag.tag)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TagsPage({
  tags,
  initiallyExpanded,
}: {
  tags: VocabularyTag[];
  initiallyExpanded?: string;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <PageHeader
        title="Tags"
        description="Every tag in the vocabulary, how often it is used, and what applies it"
      />
      <TagsTable tags={tags} initiallyExpanded={initiallyExpanded} />
    </div>
  );
}

export default function TagsScreen() {
  return <TagsPage tags={vocabularyTags} />;
}

export const states: ScreenStates = {
  empty: () => <TagsPage tags={[]} />,
  'row-expanded': () => <TagsPage tags={vocabularyTags} initiallyExpanded="venue:pub" />,
};
