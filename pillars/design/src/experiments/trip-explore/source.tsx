import { safeIdeaUrl } from '../trip-place-detail/model';
import { CaptureFileChips } from '../trip-quick-capture/file-chips';
import { exploreKindOptions, explorePurposeLabel } from './fields';
import { exploreFacts, exploreFindings } from './model';

import type { ExploreRecord } from './model';

/** Shows retained source-only context without substituting another prototype's fixture. */
export function ExploreSourceFacts({ record }: { record: ExploreRecord }) {
  const facts = exploreFacts(record);
  const findings = exploreFindings(record);
  return (
    <section aria-label="Source details" className="space-y-3 border-t pt-3 text-sm">
      <dl className="space-y-2">
        {facts.kind && (
          <Fact
            label="Kind"
            value={
              exploreKindOptions.find((kind) => kind.value === facts.kind)?.label ?? facts.kind
            }
          />
        )}
        {facts.purpose && <Fact label="Purpose" value={explorePurposeLabel(facts.purpose)} />}
        {facts.timing && <Fact label="Source timing" value={facts.timing} />}
      </dl>
      {record.source === 'idea' && <IdeaSource record={record} />}
      {record.source === 'event' && <EventSource record={record} />}
      {record.source === 'capture' && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Original text</p>
          <p className="whitespace-pre-wrap">{record.capture.text}</p>
          {record.capture.url && <SourceLink label="Source" url={record.capture.url} />}
          <CaptureFileChips files={record.capture.files} />
        </div>
      )}
      {findings.map((finding) => (
        <p key={finding.id} className="text-sm text-destructive">
          {finding.message}
        </p>
      ))}
    </section>
  );
}

function IdeaSource({ record }: { record: Extract<ExploreRecord, { source: 'idea' }> }) {
  const { idea } = record;
  return (
    <div className="space-y-3">
      <dl className="space-y-2">
        {idea.reason && <Fact label="Reason" value={idea.reason} />}
        {idea.address && <Fact label="Address" value={idea.address} />}
      </dl>
      {idea.recommendations.map((recommendation) => (
        <div key={recommendation.id} className="space-y-1 rounded-lg bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">Recommendation</p>
          {recommendation.contactId && (
            <p className="font-medium">
              {idea.contacts.find((contact) => contact.id === recommendation.contactId)?.name ??
                'Recommender unavailable'}
            </p>
          )}
          {recommendation.note && <p>{recommendation.note}</p>}
        </div>
      ))}
      {idea.links.map((link) => (
        <SourceLink key={link.id} label={link.label} url={link.url} />
      ))}
    </div>
  );
}

function EventSource({ record }: { record: Extract<ExploreRecord, { source: 'event' }> }) {
  const { metadata } = record;
  const selectedIds = [metadata.venueId, metadata.organiserId, ...metadata.documentIds];
  return (
    <div className="space-y-2">
      {record.references
        .filter((reference) => selectedIds.includes(reference.id))
        .map((reference) => (
          <div key={reference.id}>
            <p className="font-medium">{reference.name}</p>
            {reference.address && <p>{reference.address}</p>}
          </div>
        ))}
      {metadata.sourceUrl && <SourceLink label="Source" url={metadata.sourceUrl} />}
      {metadata.ticketUrl && <SourceLink label="Tickets" url={metadata.ticketUrl} />}
    </div>
  );
}

function SourceLink({ label, url }: { label: string; url: string }) {
  const href = safeIdeaUrl(url);
  return (
    <div>
      {label && <p className="text-xs text-muted-foreground">{label}</p>}
      {href ? (
        <a
          className="inline-flex min-h-11 items-center break-all text-app-accent underline underline-offset-4"
          href={href}
          target="_blank"
          rel="noreferrer"
        >
          {url}
        </a>
      ) : (
        <p className="break-all">{url}</p>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
