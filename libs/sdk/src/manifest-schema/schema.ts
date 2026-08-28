import { z } from 'zod';

import {
  CamelIdentifierSchema,
  FeatureDescriptorSchema,
  KebabIdentifierSchema,
  PillarIdSchema,
  ProcedurePathSchema,
  SettingsKeySchema,
  type FeatureDescriptor,
} from '@pops/types';

import { SettingsBlockSchema, type SettingsManifestDescriptor } from './settings.js';
import {
  AssetsBaseUrlSchema,
  CaptureOverlayDescriptorSchema,
  NavConfigDescriptorSchema,
  PageDescriptorSchema,
  type CaptureOverlayDescriptor,
  type NavConfigDescriptor,
  type NavItemDescriptor,
  type PageDescriptor,
} from './ui.js';

const SEMVER = z.string().regex(/^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/, 'must be semver');

const URI_TYPE = z
  .string()
  .regex(/^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/, 'must be <pillar>/<entity>');

const CONTRACT_PACKAGE = z
  .string()
  .regex(
    /^@pops\/(?:[a-z-]+-contract|[a-z-]+)$/,
    'must be @pops/<pillar>-contract (legacy split) or @pops/<pillar> (collapsed pillar package)'
  );

const CONTRACT_TAG = z
  .string()
  .regex(/^contract-[a-z-]+@v\d+\.\d+\.\d+(-[a-z0-9.]+)?$/, 'must be contract-<pillar>@v<semver>');

const AI_TOOL = z
  .object({
    name: CamelIdentifierSchema,
    description: z.string().min(10).max(500),
    parameters: z.record(z.string(), z.unknown()),
    allowedUriTypes: z.array(URI_TYPE).optional(),
    requiredScopes: z.array(SettingsKeySchema).optional(),
  })
  .strict();

/**
 * Event-type identifier convention (ADR-034 / PRD-236).
 *
 * `<source>.<entity>.<action>` — flat dotted namespace shared across every
 * pillar in the federation. Each segment must be lowercase, start with a
 * letter, and contain only `[a-z0-9]`. Examples:
 *
 *     finance.balance.low
 *     media.watch.completed
 *     inventory.item.added
 *
 * Naming discipline is enforced at manifest-validation time so that two
 * pillars cannot accidentally pick the same event type with diverging
 * payload shapes. See
 * [ADR-036](../../../../docs/architecture/adr-036-pillar-id-tool-name-conventions.md)
 * for the full convention (pillar id + tool name + sink event type).
 */
const SINK_EVENT_TYPE = z
  .string()
  .regex(
    /^[a-z][a-z0-9]*\.[a-z][a-z0-9]*\.[a-z][a-z0-9]*$/,
    'must match <source>.<entity>.<action> (lowercase dotted)'
  );

const SINK_DESCRIPTOR = z
  .object({
    eventType: SINK_EVENT_TYPE,
    description: z.string().min(10).max(500),
    schema: z.record(z.string(), z.unknown()),
  })
  .strict();

const SINKS = z
  .object({
    descriptors: z.array(SINK_DESCRIPTOR),
  })
  .strict();

const CONTRACT = z
  .object({
    package: CONTRACT_PACKAGE,
    version: SEMVER,
    tag: CONTRACT_TAG,
  })
  .strict();

const ROUTES = z
  .object({
    queries: z.array(ProcedurePathSchema),
    mutations: z.array(ProcedurePathSchema),
    subscriptions: z.array(ProcedurePathSchema).default([]),
  })
  .strict();

const QUERY_SHAPE = z
  .object({
    supportsText: z.boolean(),
    supportsTags: z.boolean(),
    supportsDateRange: z.boolean(),
    supportsScope: z.array(CamelIdentifierSchema),
  })
  .strict();

const SEARCH_ADAPTER = z
  .object({
    name: CamelIdentifierSchema,
    entityType: KebabIdentifierSchema,
    queryShape: QUERY_SHAPE,
    procedurePath: ProcedurePathSchema,
    rankFieldName: CamelIdentifierSchema.optional(),
  })
  .strict();

const SEARCH = z
  .object({
    adapters: z.array(SEARCH_ADAPTER),
  })
  .strict();

const AI = z
  .object({
    tools: z.array(AI_TOOL),
  })
  .strict();

const URI = z
  .object({
    types: z.array(URI_TYPE),
  })
  .strict();

const CONSUMED_SETTINGS = z
  .object({
    keys: z.array(SettingsKeySchema),
  })
  .strict();

const HEALTHCHECK = z
  .object({
    path: z.string().regex(/^\//, 'must start with /'),
  })
  .strict();

/**
 * Declared features. `@pops/types` owns the descriptor shape; the in-process
 * `FeatureDefinition` is the same shape with the wire-only `capability`
 * reference swapped for the live `capabilityCheck` probe (ADR-049).
 */
const FEATURES = z.array(FeatureDescriptorSchema);

export const ManifestPayloadSchema = z
  .object({
    pillar: PillarIdSchema,
    version: SEMVER,
    contract: CONTRACT,
    routes: ROUTES,
    search: SEARCH,
    ai: AI,
    sinks: SINKS.optional(),
    uri: URI,
    consumedSettings: CONSUMED_SETTINGS,
    settings: SettingsBlockSchema.optional(),
    nav: NavConfigDescriptorSchema.optional(),
    pages: z.array(PageDescriptorSchema).optional(),
    assetsBaseUrl: AssetsBaseUrlSchema.optional(),
    captureOverlay: CaptureOverlayDescriptorSchema.optional(),
    features: FEATURES.optional(),
    healthcheck: HEALTHCHECK,
  })
  .strict();

export type SinkDescriptor = z.infer<typeof SINK_DESCRIPTOR>;

export type FeatureManifestDescriptor = FeatureDescriptor;

export type { SettingsManifestDescriptor };

export type { CaptureOverlayDescriptor, NavConfigDescriptor, NavItemDescriptor, PageDescriptor };

export type ManifestPayload = z.infer<typeof ManifestPayloadSchema>;
