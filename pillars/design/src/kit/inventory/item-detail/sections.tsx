/**
 * The item page's disclosable sections as data: title, icon, count, a
 * one-line summary for when it is folded, and its body. Both E1 layouts
 * render these same specs, so the experiment compares layout and nothing
 * else.
 */
import { FileText, Receipt } from 'lucide-react';

import { INVENTORY_ICONS } from '../foundation';
import { ConnectionsSection, connectionsSummary } from './connections-section';
import { DocumentsSection, documentsSummary } from './documents-section';
import { HistoryPreviewSection, historySummary } from './history-preview-section';
import { ProvenanceSection, hasProvenance, provenanceSummary } from './provenance-section';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import type { DetailSectionId, ItemDetailModel } from './detail-model';

/** One section, ready for either layout. */
export interface SectionSpec {
  id: DetailSectionId;
  title: string;
  icon: LucideIcon;
  count: number | null;
  summary: string;
  /** Nothing recorded: the summary alone says so and the body is one line. */
  empty: boolean;
  /** Something here needs a look: a missing document, Paperless down. */
  flagged: boolean;
  body: ReactNode;
}

/** The sections of one item page, in reading order. */
export function detailSections(model: ItemDetailModel, readOnly: boolean): SectionSpec[] {
  const { connections, documents, paperless, provenance, events } = model;
  return [
    {
      id: 'connections',
      title: 'Connections',
      icon: INVENTORY_ICONS.connection,
      count: connections.length,
      summary: connectionsSummary(connections),
      empty: connections.length === 0,
      flagged: false,
      body: <ConnectionsSection connections={connections} readOnly={readOnly} />,
    },
    {
      id: 'documents',
      title: 'Documents',
      icon: FileText,
      count: documents.length,
      summary: documentsSummary(documents, paperless),
      empty: documents.length === 0 && paperless === 'connected',
      flagged: paperless !== 'connected' || documents.some((doc) => doc.missing === true),
      body: <DocumentsSection documents={documents} paperless={paperless} readOnly={readOnly} />,
    },
    {
      id: 'provenance',
      title: 'Provenance',
      icon: Receipt,
      count: null,
      summary: provenanceSummary(provenance),
      empty: !hasProvenance(provenance),
      flagged: false,
      body: <ProvenanceSection provenance={provenance} readOnly={readOnly} />,
    },
    {
      id: 'history',
      title: 'History',
      icon: INVENTORY_ICONS.history,
      count: model.eventCount,
      summary: historySummary(events),
      empty: false,
      flagged: false,
      body: <HistoryPreviewSection events={events} total={model.eventCount} />,
    },
  ];
}
