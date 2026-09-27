export type RequestIdAccessor = () => string | undefined;

let requestIdAccessor: RequestIdAccessor = () => undefined;

export function readCurrentRequestId(): string | undefined {
  return requestIdAccessor();
}

export function installRequestIdAccessor(accessor: RequestIdAccessor): void {
  requestIdAccessor = accessor;
}
