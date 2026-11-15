/** Controlled completion without depending on a newer TypeScript Promise library declaration. */
export function deferred<Value>(): {
  promise: Promise<Value>;
  resolve: (value: Value) => void;
} {
  let complete: (value: Value | PromiseLike<Value>) => void = () => {
    throw new Error('Deferred completion is not initialized');
  };
  const promise = new Promise<Value>((resolve) => {
    complete = resolve;
  });
  return { promise, resolve: (value: Value): void => complete(value) };
}

/** Supply test bytes through the same asynchronous iteration contract as an incoming request. */
export async function* chunks(...values: Uint8Array[]): AsyncGenerator<Uint8Array> {
  yield* values;
}
