import { PillarCallError, type CallResult } from '@pops/pillar-sdk/client';
import { RegistryUnreachableError } from '@pops/pillar-sdk/discovery';
import { pillar } from '@pops/pillar-sdk/server';
import {
  TaggedQueryRequestSchema,
  TaggedQueryResponseSchema,
  type TaggedQueryRequest,
  type TaggedQueryResponse,
} from '@pops/types';

import { defaultSnapshotReader, type RegistrySnapshotReader } from '../pillars/registry.js';

import type { PillarSnapshot } from '@pops/pillar-sdk/discovery';

const MAX_TAGGED_QUERY_IDS = 500;

interface ExpandedTagIds {
  ids: string[];
  unknownIds: string[];
}

/** Request passed to the shared-tag federator. */
export interface TagFederationRequest {
  readonly tagIds: readonly string[];
  readonly limit?: number;
  readonly cursor?: string;
}

/** One carrier pillar's validated tagged-query response. */
export interface TagFederationSection {
  readonly pillarId: string;
  readonly items: TaggedQueryResponse['items'];
  readonly nextCursor: string | null;
}

/** Result state for one registered tag-carrier pillar. */
export type TagFederationStatus = 'ok' | 'unavailable' | 'unauthorized';

/** Availability reported for a tag-carrier pillar. */
export interface TagFederationPillarStatus {
  readonly pillarId: string;
  readonly status: TagFederationStatus;
}

/** Federated sections and the status of every carrier queried. */
export interface TagFederationResponse {
  readonly expandedTagIds: string[];
  readonly sections: TagFederationSection[];
  readonly pillars: TagFederationPillarStatus[];
}

/** Injected dispatcher for the tags pillar's expand operation. */
export type TagExpansionInvoker = (input: { ids: string[] }) => Promise<CallResult<ExpandedTagIds>>;

/** Injected dispatcher for a carrier pillar's tagged.list operation. */
export type TaggedListInvoker = (
  pillarId: string,
  input: TaggedQueryRequest
) => Promise<CallResult<unknown>>;

/** Dependencies used by the tag federator. */
export interface TagFederationOptions {
  readonly expand?: TagExpansionInvoker;
  readonly invoke?: TaggedListInvoker;
  readonly snapshotReader?: RegistrySnapshotReader;
  readonly onWarn?: (message: string, detail?: unknown) => void;
}

type TaggedCarrierOutcome =
  | { readonly kind: 'result'; readonly pillarId: string; readonly result: CallResult<unknown> }
  | { readonly kind: 'thrown'; readonly pillarId: string; readonly error: unknown };

type PillarTagExpansionRouter = {
  tags: {
    expand: (input: { ids: string[] }) => ExpandedTagIds;
  };
};

type PillarTaggedRouter = {
  tagged: {
    list: (input: TaggedQueryRequest) => unknown;
  };
};

/** Production dispatcher for tags.expand through the pillar SDK. */
export const sdkTagExpansionInvoker: TagExpansionInvoker = (input) =>
  pillar<PillarTagExpansionRouter>('tags').tags.expand(input);

/** Production dispatcher for tagged.list through the pillar SDK. */
export const sdkTaggedListInvoker: TaggedListInvoker = (pillarId, input) =>
  pillar<PillarTaggedRouter>(pillarId).tagged.list(input);

function isRegisteredAndHealthy(snapshot: PillarSnapshot): boolean {
  if (!snapshot.registered) return false;
  return snapshot.status === undefined || snapshot.status === 'healthy';
}

function selectTagCarriers(
  snapshots: readonly PillarSnapshot[],
  onWarn: (message: string, detail?: unknown) => void
): string[] {
  const carrierIds: string[] = [];

  for (const snapshot of snapshots) {
    try {
      if (!isRegisteredAndHealthy(snapshot)) continue;
      if (snapshot.manifest.tags === undefined) continue;
      carrierIds.push(snapshot.pillarId);
    } catch (error) {
      onWarn('[orchestrator] skipped malformed registry entry during tag projection', error);
    }
  }

  return carrierIds;
}

async function resolveTagCarriers(
  reader: RegistrySnapshotReader,
  onWarn: (message: string, detail?: unknown) => void
): Promise<string[]> {
  try {
    return selectTagCarriers(await reader(), onWarn);
  } catch (error) {
    if (error instanceof RegistryUnreachableError) {
      onWarn('[orchestrator] registry unreachable; shared-tag query unavailable', error);
    } else {
      onWarn('[orchestrator] registry read failed; shared-tag query unavailable', error);
    }
    throw error;
  }
}

function buildFederationResponse(
  outcomes: readonly TaggedCarrierOutcome[],
  expansionWasBounded: boolean,
  onWarn: (message: string, detail?: unknown) => void
): Omit<TagFederationResponse, 'expandedTagIds'> {
  const sections: TagFederationSection[] = [];
  const pillars: TagFederationPillarStatus[] = [];

  for (const outcome of outcomes) {
    if (outcome.kind === 'thrown') {
      onWarn('[orchestrator] tagged.list carrier ' + outcome.pillarId + ' threw', outcome.error);
      pillars.push({ pillarId: outcome.pillarId, status: 'unavailable' });
      continue;
    }

    const { pillarId, result } = outcome;
    if (result.kind !== 'ok') {
      const status = result.kind === 'unauthorized' ? 'unauthorized' : 'unavailable';
      onWarn('[orchestrator] tagged.list carrier ' + pillarId + ' ' + result.kind, result);
      pillars.push({ pillarId, status });
      continue;
    }

    const parsed = TaggedQueryResponseSchema.safeParse(result.value);
    if (!parsed.success) {
      onWarn(
        '[orchestrator] tagged.list carrier ' + pillarId + ' returned malformed data',
        parsed.error
      );
      pillars.push({ pillarId, status: 'unavailable' });
      continue;
    }

    sections.push({ pillarId, ...parsed.data });
    pillars.push({ pillarId, status: expansionWasBounded ? 'unavailable' : 'ok' });
  }

  return { sections, pillars };
}

/**
 * Build the shared-tag federator. It expands requested tags once, resolves
 * healthy carriers from the live registry, and queries them concurrently.
 * Carrier failures are isolated and reported in the pillars status list;
 * expansion failures reject the whole request.
 */
export function createTagFederation(
  options: TagFederationOptions = {}
): (request: TagFederationRequest) => Promise<TagFederationResponse> {
  const expand = options.expand ?? sdkTagExpansionInvoker;
  const invoke = options.invoke ?? sdkTaggedListInvoker;
  const snapshotReader = options.snapshotReader ?? defaultSnapshotReader;
  const onWarn = options.onWarn ?? defaultWarn;

  return async (request) => {
    const expansion = await expand({ ids: [...request.tagIds] });
    if (expansion.kind !== 'ok') throw new PillarCallError('tags', expansion);

    const expandedIds = expansion.value.ids;
    const carrierIds = await resolveTagCarriers(snapshotReader, onWarn);

    if (expandedIds.length === 0) {
      return {
        expandedTagIds: expandedIds,
        sections: carrierIds.map((pillarId) => ({ pillarId, items: [], nextCursor: null })),
        pillars: carrierIds.map((pillarId) => ({ pillarId, status: 'ok' })),
      };
    }

    const expansionWasBounded = expandedIds.length > MAX_TAGGED_QUERY_IDS;
    if (expansionWasBounded) {
      // Keep the carrier request schema-valid and expose the incomplete scope
      // through its status instead of failing or claiming a complete result.
      onWarn(
        '[orchestrator] expanded tag query exceeds tagged.list limit; returning a bounded result',
        { expandedIdCount: expandedIds.length, maxTagIds: MAX_TAGGED_QUERY_IDS }
      );
    }

    const query = TaggedQueryRequestSchema.parse({
      tagIds: expandedIds.slice(0, MAX_TAGGED_QUERY_IDS),
      ...(request.limit !== undefined ? { limit: request.limit } : {}),
      ...(request.cursor !== undefined ? { cursor: request.cursor } : {}),
    });
    const outcomes = await Promise.all(
      carrierIds.map(async (pillarId) => {
        try {
          return { kind: 'result' as const, pillarId, result: await invoke(pillarId, query) };
        } catch (error) {
          return { kind: 'thrown' as const, pillarId, error };
        }
      })
    );
    return {
      expandedTagIds: expandedIds,
      ...buildFederationResponse(outcomes, expansionWasBounded, onWarn),
    };
  };
}

function defaultWarn(message: string, detail?: unknown): void {
  if (detail === undefined) console.warn(message);
  else console.warn(message, detail);
}
