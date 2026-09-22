/** A corrupt persisted catalogue definition that cannot safely be used. */
export class CatalogueDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogueDataError';
  }
}
