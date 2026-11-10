/** Browser-only field identity keeps focus while opaque reference content is edited. */
export class CaptureReferenceIdentities {
  private keys = new WeakMap<object, string>();
  /** Read a retained identity without using editable URI, label, note or array position. */
  key(value: object): string {
    let key = this.keys.get(value);
    if (key === undefined) {
      key = crypto.randomUUID();
      this.keys.set(value, key);
    }
    return key;
  }
  /** A replacement is the same editable row even when every public field changes. */
  replace<T extends object>(before: T, after: T): T {
    this.keys.set(after, this.key(before));
    return after;
  }
}
