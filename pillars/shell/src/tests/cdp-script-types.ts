import { z } from 'zod';

const messageSchema = z.object({
  id: z.number().int().optional(),
  method: z.string().optional(),
  sessionId: z.string().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  result: z.record(z.string(), z.unknown()).optional(),
  error: z.unknown().optional(),
});

/** Inspected CDP envelope fields; forwarding always retains the complete original object. */
export type CdpMessage = z.infer<typeof messageSchema>;

/** An actual outgoing command whose reply must acknowledge the same ID and session. */
export interface CdpCommand {
  readonly id: number;
  readonly method: string;
  readonly sessionId: string | undefined;
  readonly params: Readonly<Record<string, unknown>> | undefined;
}

/** Validate protocol metadata without interpreting URLs or accessing Playwright internals. */
export function inspectCdpMessage(value: unknown): CdpMessage {
  return messageSchema.parse(value);
}

/** A script lifetime identified by its real protocol session and request IDs. */
export interface ObservedScript {
  readonly sessionId: string;
  readonly requestId: string;
  readonly method: string;
  readonly url: string;
}
