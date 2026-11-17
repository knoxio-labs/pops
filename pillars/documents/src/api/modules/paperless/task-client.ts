import { ensureOk, paperlessFetch, type PaperlessConnection } from './http.js';
import { mapPaperlessTask, RawTaskPageSchema, type PaperlessTaskStatus } from './task-state.js';
import { PAPERLESS_TIMEOUTS } from './timeouts.js';
import { PaperlessApiError } from './types.js';

/** Paperless 3.2.1's default; pinned so a server-side default change cannot reshape tasks. */
const TASKS_ACCEPT = 'application/json; version=10';

/** Read only the exact requested Paperless task using the existing versioned task contract. */
export async function readPaperlessTask(
  connection: PaperlessConnection,
  taskId: string
): Promise<PaperlessTaskStatus | null> {
  const response = await paperlessFetch(
    connection,
    `/api/tasks/?${new URLSearchParams({ task_id: taskId }).toString()}`,
    { headers: { Accept: TASKS_ACCEPT }, timeoutMs: PAPERLESS_TIMEOUTS.read }
  );
  const parsed = RawTaskPageSchema.safeParse(await (await ensureOk(response)).json());
  if (!parsed.success) {
    throw new PaperlessApiError(response.status, 'Unrecognised Paperless task shape');
  }
  const [task] = parsed.data.results.filter((candidate) => candidate.task_id === taskId);
  return task === undefined ? null : mapPaperlessTask(task);
}
