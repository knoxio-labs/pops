import { randomUUID } from 'node:crypto';

import { type WebBatchBody, type WebBatchResponse } from '../../contract/rest-web-batch.js';
import {
  runMutation,
  type CommandDb,
  type Outcome,
  type Placement,
} from '../../domain/commands/index.js';
import {
  createWebBatchContext,
  isBlankWebBatchRow,
  placementForWebBatchRow,
  resolveBatchType,
  webBatchRowIssues,
  type WebBatchContext,
  type WebBatchRow,
} from './batch-validation.js';

type WebBatchOutcome = WebBatchResponse['outcomes'][number];

const WEB_ACTOR = { kind: 'web' } as const;
const WHERE_REJECTION_REASONS = new Set([
  'target_missing',
  'not_container',
  'cycle',
  'quantity_container_conflict',
]);

class DryRunRollback extends Error {
  constructor(readonly response: WebBatchResponse) {
    super('web batch dry run');
  }
}

function issueForOutcome(
  row: number,
  input: WebBatchRow,
  outcome: Exclude<Outcome, { status: 'applied' }>
): WebBatchOutcome {
  if (outcome.status === 'conflict' && outcome.kind === 'code_collision') {
    return {
      status: 'invalid',
      row,
      issues: [
        {
          column: 'code',
          code: 'code_taken',
          message: `Code ${input.code.trim().toUpperCase()} is already on ${outcome.heldBy.name}.`,
        },
      ],
    };
  }
  if (outcome.status === 'conflict') {
    return {
      status: 'invalid',
      row,
      issues: [{ column: 'type', code: outcome.kind, message: 'The item could not be created.' }],
    };
  }
  if (outcome.status === 'rejected') {
    return {
      status: 'invalid',
      row,
      issues: [
        {
          column: WHERE_REJECTION_REASONS.has(outcome.reason) ? 'where' : 'type',
          code: outcome.reason,
          message: outcome.message,
        },
      ],
    };
  }
  return {
    status: 'invalid',
    row,
    issues: [
      {
        column: 'type',
        code: 'deferred',
        message: `The item is waiting on mutation ${outcome.waitingOn}.`,
      },
    ],
  };
}

interface CreateRowInput {
  readonly db: CommandDb;
  readonly row: WebBatchRow;
  readonly rowIndex: number;
  readonly context: WebBatchContext;
  readonly destination: Placement;
  readonly dryRun: boolean;
  readonly clientTime: string;
}

function createRow({
  db,
  row,
  rowIndex,
  context,
  destination,
  dryRun,
  clientTime,
}: CreateRowInput): WebBatchOutcome {
  const type = resolveBatchType(context.catalogue, row.type);
  const quantity = row.quantity.trim() === '' ? 1 : Number(row.quantity.trim());
  const code = row.code.trim();
  const entityId = randomUUID();
  const outcome = runMutation(
    db,
    {
      mutationId: randomUUID(),
      op: 'item.create',
      entityId,
      baseRevision: null,
      dependsOn: [],
      clientTime,
      ...(context.catalogue === null
        ? {}
        : { catalogueRevision: context.catalogue.revision.revision }),
      args: {
        item: {
          name: row.name,
          typeId: type?.id ?? null,
          note: row.note,
          quantity,
          placement: placementForWebBatchRow(row, context, destination),
        },
        code: code === '' ? null : code,
      },
    },
    WEB_ACTOR
  );
  if (outcome.status === 'applied') {
    return dryRun
      ? { status: 'valid', row: rowIndex }
      : { status: 'created', row: rowIndex, itemId: entityId };
  }
  return issueForOutcome(rowIndex, row, outcome);
}

function executeBatch(db: CommandDb, body: WebBatchBody): WebBatchResponse {
  const context = createWebBatchContext(db);
  const clientTime = new Date().toISOString();
  const outcomes: WebBatchOutcome[] = [];
  for (const [rowIndex, row] of body.rows.entries()) {
    if (isBlankWebBatchRow(row)) {
      outcomes.push({ status: 'blank', row: rowIndex });
      continue;
    }
    const issues = webBatchRowIssues(body.rows, rowIndex, context);
    if (issues.length > 0) {
      outcomes.push({ status: 'invalid', row: rowIndex, issues });
      continue;
    }
    outcomes.push(
      createRow({
        db,
        row,
        rowIndex,
        context,
        destination: body.destination,
        dryRun: body.dryRun,
        clientTime,
      })
    );
  }
  return { outcomes };
}

/** Validate and partially create web bulk-entry rows, or simulate the request without writes. */
export function runWebBatch(db: CommandDb, body: WebBatchBody): WebBatchResponse {
  if (!body.dryRun) return executeBatch(db, body);
  try {
    db.transaction(
      (tx) => {
        throw new DryRunRollback(executeBatch(tx, body));
      },
      { behavior: 'immediate' }
    );
  } catch (error) {
    if (error instanceof DryRunRollback) return error.response;
    throw error;
  }
  throw new Error('web batch dry run completed without rollback');
}
