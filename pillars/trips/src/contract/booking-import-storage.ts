/** Durable lookup proofs; none of these identities is a model-generated candidate identity. */
export type BookingRequestReceipt =
  | { kind: 'bind'; bindingId: string }
  | { kind: 'extract'; attemptId: string }
  | { kind: 'review'; decisionIds: string[] }
  | {
      kind: 'commit';
      decisionIds: string[];
      sourceOperationIds: string[];
      originalOperationId: string;
    };
