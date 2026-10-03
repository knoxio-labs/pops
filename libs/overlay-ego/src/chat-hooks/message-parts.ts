/** Plain assistant text. */
export interface TextPart {
  type: 'text';
  text: string;
}

/** A reference to an entity, rendered by each client as its own card for the URI type. */
export interface EntityPart {
  type: 'entity';
  uri: string;
  title: string;
  subtitle?: string;
}

/** Lifecycle of one proposed write inside a batch. */
export type ActionStatus = 'pending' | 'confirmed' | 'rejected' | 'executed' | 'failed';

/** One proposed or already executed write inside a batch. */
export interface BatchAction {
  actionId: string;
  tool: string;
  summary: string;
  status: ActionStatus;
}

/** One batch of proposed or already executed writes; a batch is decided as a unit. */
export interface ActionsPart {
  type: 'actions';
  batchId: string;
  actions: BatchAction[];
}

/** Any part a message can carry. */
export type MessagePart = TextPart | EntityPart | ActionsPart;

const ACTION_STATUSES: readonly ActionStatus[] = [
  'pending',
  'confirmed',
  'rejected',
  'executed',
  'failed',
];

/** Narrows an unknown value to a plain keyed object (arrays and null excluded). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isActionStatus(value: unknown): value is ActionStatus {
  return ACTION_STATUSES.some((status) => status === value);
}

function parseTextPart(raw: Record<string, unknown>): TextPart | null {
  return typeof raw.text === 'string' ? { type: 'text', text: raw.text } : null;
}

function parseEntityPart(raw: Record<string, unknown>): EntityPart | null {
  if (typeof raw.uri !== 'string' || typeof raw.title !== 'string') return null;
  const part: EntityPart = { type: 'entity', uri: raw.uri, title: raw.title };
  if (typeof raw.subtitle === 'string') part.subtitle = raw.subtitle;
  return part;
}

function parseBatchAction(raw: unknown): BatchAction | null {
  if (!isRecord(raw)) return null;
  const { actionId, tool, summary, status } = raw;
  if (typeof actionId !== 'string' || typeof tool !== 'string' || typeof summary !== 'string') {
    return null;
  }
  return isActionStatus(status) ? { actionId, tool, summary, status } : null;
}

function parseActionsPart(raw: Record<string, unknown>): ActionsPart | null {
  if (typeof raw.batchId !== 'string' || raw.batchId === '') return null;
  if (!Array.isArray(raw.actions) || raw.actions.length === 0) return null;
  const actions: BatchAction[] = [];
  for (const entry of raw.actions) {
    const action = parseBatchAction(entry);
    if (!action) return null;
    actions.push(action);
  }
  return { type: 'actions', batchId: raw.batchId, actions };
}

/**
 * Validates one untrusted message part. Returns null for a non-object, an unknown
 * `type`, or a missing or non-string required field. An `actions` part is null when
 * `batchId` is empty, `actions` is empty, or any entry is invalid. A non-string
 * `subtitle` is dropped rather than rejecting the part.
 */
export function parseMessagePart(raw: unknown): MessagePart | null {
  if (!isRecord(raw)) return null;
  switch (raw.type) {
    case 'text':
      return parseTextPart(raw);
    case 'entity':
      return parseEntityPart(raw);
    case 'actions':
      return parseActionsPart(raw);
    default:
      return null;
  }
}

/**
 * Validates an untrusted list of message parts. A non-array yields an empty array;
 * invalid members are dropped and the order of the rest is kept.
 */
export function parseMessageParts(raw: unknown): MessagePart[] {
  if (!Array.isArray(raw)) return [];
  const parts: MessagePart[] = [];
  for (const entry of raw) {
    const part = parseMessagePart(entry);
    if (part) parts.push(part);
  }
  return parts;
}
