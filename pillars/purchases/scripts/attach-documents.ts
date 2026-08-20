/**
 * The half of a backfill that puts evidence on orders it did not create.
 *
 * `POST /purchases` is create-only, so an export bundle re-read against a
 * database that already holds its orders attaches nothing: every order is
 * refused at the checksum and the documents it was carrying are refused with
 * it. This posts them one at a time to `POST /purchases/{id}/documents`
 * instead, which is addressed by the order's own id rather than by its
 * payload — the one thing an already-ingested order can be reached by.
 *
 * Resolving that id is what {@link fetchPurchaseIdsBySourceOrderId} is for.
 * The order index is paged rather than queried per order: an adapter holding
 * hundreds of merchant order ids would otherwise make hundreds of round trips
 * to learn what two pages already say.
 *
 * Split from `backfill.ts` because that file is at its line budget, not
 * because the credential handling differs — both go through its `ingestFetch`
 * so the service-account header cannot be dropped from one and kept on the
 * other.
 */
import { z } from 'zod';

import { PurchaseSchema } from '../src/contract/schemas/purchase.js';
import { ingestFetch } from './backfill.js';

import type { CreateDocumentInput } from '../src/db/services/purchase-input.js';
import type { IngestClient } from './backfill.js';

/**
 * `GET /purchases` caps `limit` at 500 (`ListPurchasesQuerySchema`), and a
 * short page is how the walk knows it has reached the end.
 */
const ORDER_PAGE_SIZE = 500;

/**
 * Only the two fields the walk reads, picked off the contract's own schema so
 * a rename in the pillar fails here rather than silently matching nothing.
 */
const OrderPageSchema = z.object({
  items: z.array(PurchaseSchema.pick({ id: true, sourceOrderId: true })),
});

/**
 * Every order of one source, indexed by the merchant's own order id.
 *
 * Orders carrying no `sourceOrderId` are left out: they cannot be named by an
 * export bundle, which is the only thing this map is used to answer.
 *
 * @throws When a page cannot be read, or when a full page repeats rows the
 *   walk has already seen — a server or proxy ignoring `offset` answers the
 *   same page forever, which would otherwise loop without bound. A partial
 *   map would look like a bundle naming orders that are not in the database,
 *   and the run would report the evidence as unattachable rather than unread.
 */
export async function fetchPurchaseIdsBySourceOrderId(
  client: IngestClient,
  source: string
): Promise<ReadonlyMap<string, string>> {
  const ids = new Map<string, string>();
  const seenRows = new Set<string>();

  for (let offset = 0; ; offset += ORDER_PAGE_SIZE) {
    const query = new URLSearchParams({
      sources: source,
      limit: String(ORDER_PAGE_SIZE),
      offset: String(offset),
    });
    const response = await ingestFetch(client, `/purchases?${query.toString()}`, 'GET');
    if (!response.ok) {
      throw new Error(
        `could not read the ${source} orders already in the database ` +
          `(${String(response.status)}): ${await response.text()}`
      );
    }

    const { items } = OrderPageSchema.parse(await response.json());
    let fresh = 0;
    for (const { id, sourceOrderId } of items) {
      if (seenRows.has(id)) continue;
      seenRows.add(id);
      fresh += 1;
      if (sourceOrderId !== null) ids.set(sourceOrderId, id);
    }
    if (items.length < ORDER_PAGE_SIZE) return ids;
    // Row ids rather than the map: a full page of orders the merchant never
    // named adds nothing to the map and is still honest paging.
    if (fresh === 0) {
      throw new Error(
        `the ${source} order index returned a full page of orders already seen at ` +
          `offset ${String(offset)}; it is not honouring offset and the walk cannot finish`
      );
    }
  }
}

/** One document, and the order it is to be attached to. */
export interface DocumentAttachment {
  readonly purchaseId: string;
  readonly document: CreateDocumentInput;
}

export interface AttachOutcome {
  readonly attached: number;
  /**
   * Already on the order. The re-run case, and not a failure: it is what
   * makes running this twice a no-op rather than a second row.
   */
  readonly alreadyAttached: number;
  readonly failures: readonly string[];
}

export interface AttachHooks {
  /**
   * Called for every URI the database is now known to reference — on a fresh
   * attach and on a repeat alike. A repeat means a row was already pointing
   * at those bytes, so they are no less required than the ones just written.
   */
  readonly onReferenced?: (documentUri: string) => void;
}

/**
 * Attach each document, treating a repeat as a skip.
 *
 * A 401 or 403 stops the run rather than being recorded once per remaining
 * document: the account cannot attach at all, so every request after it is
 * known to fail before it is sent. It is recorded as a failure and reported
 * rather than thrown, because the orders posted before it may well have been
 * written and the run has to say so.
 */
export async function attachDocuments(
  client: IngestClient,
  attachments: readonly DocumentAttachment[],
  hooks: AttachHooks = {}
): Promise<AttachOutcome> {
  let attached = 0;
  let alreadyAttached = 0;
  const failures: string[] = [];

  for (const { purchaseId, document } of attachments) {
    const response = await ingestFetch(client, `/purchases/${purchaseId}/documents`, 'POST', {
      documentUri: document.documentUri,
      kind: document.kind,
    });

    if (response.status === 201) attached += 1;
    else if (response.status === 409) alreadyAttached += 1;
    else {
      failures.push(
        `${purchaseId} ${document.documentUri} -> ${String(response.status)} ` +
          (await response.text())
      );
      if (response.status === 401 || response.status === 403) {
        failures.push(
          'stopping: the service account is not authorised to attach documents; grant it ' +
            'purchases.purchase and re-run — a document already attached comes back as a 409 ' +
            'and is skipped'
        );
        break;
      }
      continue;
    }
    hooks.onReferenced?.(document.documentUri);
  }

  return { attached, alreadyAttached, failures };
}
