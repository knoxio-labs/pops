export interface PopsErrorOptions {
  readonly code: string;
  readonly status: number;
  readonly message: string;
  readonly retryable: boolean;
  readonly details?: unknown;
}

/** A user-safe, registered REST failure that can be serialized by the final handler. */
export class PopsError extends Error {
  override readonly name = 'PopsError';
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly details: unknown;

  constructor(options: PopsErrorOptions) {
    super(options.message);
    this.code = options.code;
    this.status = options.status;
    this.retryable = options.retryable;
    this.details = options.details;
  }
}

export interface ErrorDefinition {
  readonly area: string;
  readonly status: number;
  readonly message: string;
  readonly retryable: boolean;
}

type ErrorDefinitionMap = Record<string, ErrorDefinition>;

type DefinedErrors<TDefinitions extends ErrorDefinitionMap> = {
  readonly [TReason in keyof TDefinitions]: (details?: unknown) => never;
};

/**
 * Build typed throwing helpers whose codes follow `<pillar>.<area>.<reason>`.
 * The returned helpers throw immediately with their registered metadata.
 */
export function defineErrors<TDefinitions extends ErrorDefinitionMap>(
  pillar: string,
  definitions: TDefinitions
): DefinedErrors<TDefinitions> {
  const errors = {} as { [reason: string]: (details?: unknown) => never };
  for (const [reason, definition] of Object.entries(definitions)) {
    errors[reason] = (details?: unknown): never => {
      throw new PopsError({
        code: `${pillar}.${definition.area}.${reason}`,
        status: definition.status,
        message: definition.message,
        retryable: definition.retryable,
        details,
      });
    };
  }
  return errors as DefinedErrors<TDefinitions>;
}
