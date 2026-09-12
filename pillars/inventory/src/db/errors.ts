/**
 * Typed errors raised by the inventory domain service layer.
 *
 * Plain Error subclasses — the service layer doesn't know about HTTP.
 * The contract handlers map them to status codes when surfacing to clients.
 */

export class LocationNotFoundError extends Error {
  override readonly name = 'LocationNotFoundError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Location '${id}' not found`);
    this.id = id;
  }
}

export class ParentLocationNotFoundError extends Error {
  override readonly name = 'ParentLocationNotFoundError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Parent location '${id}' not found`);
    this.id = id;
  }
}

export class LocationSelfParentError extends Error {
  override readonly name = 'LocationSelfParentError' as const;
  readonly id: string;

  constructor(id: string) {
    super('A location cannot be its own parent');
    this.id = id;
  }
}

export class LocationCycleError extends Error {
  override readonly name = 'LocationCycleError' as const;
  readonly id: string;
  readonly newParentId: string;

  constructor(id: string, newParentId: string) {
    super('Moving this location would create a circular reference');
    this.id = id;
    this.newParentId = newParentId;
  }
}

export class ContainerNotFoundError extends Error {
  override readonly name = 'ContainerNotFoundError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Container '${id}' not found`);
    this.id = id;
  }
}

export class ContainerOriginLocationNotFoundError extends Error {
  override readonly name = 'ContainerOriginLocationNotFoundError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Origin location '${id}' not found`);
    this.id = id;
  }
}

export class ContainerDestinationLocationNotFoundError extends Error {
  override readonly name = 'ContainerDestinationLocationNotFoundError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Destination location '${id}' not found`);
    this.id = id;
  }
}
