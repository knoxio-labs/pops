import { type VocabularyTag, vocabularyTags } from '@/fixtures/tags';
import { TagName } from '@/kit/tag-sources';

import { PageHeader } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Tags', order: 9, frame: 'web' };

function TagsTable({ tags }: { tags: VocabularyTag[] }) {
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
              <tr key={tag.tag}>
                <td className="px-4 py-2">
                  <TagName tag={tag.tag} />
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{tag.transactionCount}</td>
                <td className="px-4 py-2 text-right tabular-nums">{tag.rules.length}</td>
                <td className="px-4 py-2 text-right tabular-nums">{tag.merchants.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TagsPage({ tags }: { tags: VocabularyTag[] }) {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <PageHeader
        title="Tags"
        description="Every tag in the vocabulary, how often it is used, and what applies it"
      />
      <TagsTable tags={tags} />
    </div>
  );
}

export default function TagsScreen() {
  return <TagsPage tags={vocabularyTags} />;
}

export const states: ScreenStates = {
  empty: () => <TagsPage tags={[]} />,
};
