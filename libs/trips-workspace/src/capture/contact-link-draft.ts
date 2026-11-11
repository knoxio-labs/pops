import type { CaptureRecordDrafts, IdeaRecordDraft } from './record-drafts';

type Idea = Parameters<CaptureRecordDrafts['editIdea']>[0];
type LinkFields = Pick<Idea, 'contactLinks' | 'recommendations'>;

/** Exact newly prepared entry and required occurrence count, preserving independently identical references. */
export interface PreparedContactLink {
  kind: 'idea-contact' | 'recommendation';
  reference: { uri: string };
  count: number;
}

function occurrences(
  fields: Partial<LinkFields>,
  kind: PreparedContactLink['kind'],
  uri: string
): number {
  return kind === 'idea-contact'
    ? (fields.contactLinks?.filter((reference) => reference.uri === uri).length ?? 0)
    : (fields.recommendations?.filter((item) => item.contact.uri === uri).length ?? 0);
}

/** Append one explicit canonical link to the current draft without restoring previously discarded fields. */
export function prepareContactLink(
  records: CaptureRecordDrafts,
  idea: Idea,
  kind: PreparedContactLink['kind'],
  uri: string
): PreparedContactLink {
  const draft = records.idea(idea.id)?.input;
  const reference = { uri };
  const fields = {
    contactLinks: draft?.contactLinks ?? idea.contactLinks,
    recommendations: draft?.recommendations ?? idea.recommendations,
  };
  if (kind === 'idea-contact')
    records.editIdea(idea, { contactLinks: [...fields.contactLinks, reference] });
  else
    records.editIdea(idea, {
      recommendations: [...fields.recommendations, { contact: reference, note: '' }],
    });
  return { kind, reference, count: occurrences(fields, kind, uri) + 1 };
}

/** Require the selected canonical reference in the actual submitted field or confirmed source projection. */
export function containsContactLink(
  link: PreparedContactLink,
  fields: Partial<LinkFields>
): boolean {
  return occurrences(fields, link.kind, link.reference.uri) >= link.count;
}

/** Remove only this intent's unsent draft entry, preserving other fields and independently identical links. */
export function discardPreparedContactLink(
  records: CaptureRecordDrafts,
  idea: Idea,
  link: PreparedContactLink
): void {
  const draft: IdeaRecordDraft | undefined = records.idea(idea.id);
  if (link.kind === 'idea-contact' && draft?.input.contactLinks?.includes(link.reference))
    records.editIdea(idea, {
      contactLinks: draft.input.contactLinks.filter((reference) => reference !== link.reference),
    });
  else if (
    link.kind === 'recommendation' &&
    draft?.input.recommendations?.some((item) => item.contact === link.reference)
  )
    records.editIdea(idea, {
      recommendations: draft.input.recommendations.filter(
        (item) => item.contact !== link.reference
      ),
    });
}
