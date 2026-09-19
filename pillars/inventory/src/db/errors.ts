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
