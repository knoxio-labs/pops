/**
 * Radarr and Sonarr return `/queue` as a page, not a list: the response is
 * `{ totalRecords, records }` and the server's own default page size (10)
 * applies when none is asked for. Reading one page and treating it as the queue
 * makes "not downloading" a claim about the first ten items — which the
 * rotation engine then acts on by deleting files (POPS-2703).
 */

/** The paged shape both *arr queue endpoints return. */
export interface ArrQueuePage<TRecord> {
  totalRecords: number;
  records: TRecord[];
}

/** Rows per request. Radarr accepts up to 1000; this keeps a page small enough to be cheap. */
const QUEUE_PAGE_SIZE = 200;

/**
 * Backstop against a peer that never stops reporting more — a runaway guard,
 * not a dataset cap. At {@link QUEUE_PAGE_SIZE} this is 20,000 queue items,
 * far beyond any real download queue, so reaching it means something is wrong
 * and it is reported rather than silently returning a partial queue.
 */
const MAX_QUEUE_PAGES = 100;

/**
 * Read every page of an *arr download queue.
 *
 * @param fetchPage fetches one 1-indexed page of `pageSize` records.
 * @param label     client name, for the truncation warning.
 */
export async function fetchWholeQueue<TRecord>(
  fetchPage: (page: number, pageSize: number) => Promise<ArrQueuePage<TRecord>>,
  label: string
): Promise<ArrQueuePage<TRecord>> {
  const records: TRecord[] = [];
  let totalRecords = 0;

  for (let page = 1; page <= MAX_QUEUE_PAGES; page++) {
    const result = await fetchPage(page, QUEUE_PAGE_SIZE);
    totalRecords = result.totalRecords;
    records.push(...result.records);
    if (result.records.length === 0 || records.length >= totalRecords) {
      return { totalRecords, records };
    }
  }

  console.warn(
    `[${label}] queue sweep hit the ${MAX_QUEUE_PAGES}-page cap with ${records.length} of ` +
      `${totalRecords} records — the queue is TRUNCATED and anything past it will read as ` +
      `not downloading`
  );
  return { totalRecords, records };
}
