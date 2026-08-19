/**
 * One ISO-8601 instant schema, for both directions of the wire.
 *
 * The pattern mirrors `purchases`' `IsoTimestampSchema` exactly, offsets
 * included, so bfm rejects what that pillar rejects and nothing more. Two
 * places need it and they need the *same* one:
 *
 * - a request field bfm forwards to a producer, where a looser pattern here
 *   would accept a value the producer then refuses, turning a fixable client
 *   mistake into an upstream error the phone cannot act on;
 * - a response field bfm reads back from a producer, where a bare string
 *   would reach a handset as a date that renders blank or as today — neither
 *   distinguishable from a receipt that stated no date at all, which the
 *   producer signals a completely different way.
 *
 * They were two copies of the same regex until the receipt upload needed a
 * third. A timezone is required in both directions for the same reason: a
 * naive local timestamp is ambiguous by up to a day against every other
 * instant in the federation.
 */
import { z } from 'zod';

export const ISO_TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/u;

export const IsoTimestampSchema = z
  .string()
  .regex(ISO_TIMESTAMP_RE, 'expected an ISO-8601 timestamp with a timezone');
