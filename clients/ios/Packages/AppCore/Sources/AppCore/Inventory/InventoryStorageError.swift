/// Thrown by `InventoryStore.perform(_:)` or `download()` when the phone does
/// not have room for the change: ADR-002 D11's 200 MB free-space threshold
/// checked before staging a photo, or `SQLITE_FULL` from the write itself.
/// The only Inventory failure shown as an alert rather than a repair or a
/// blocking sheet, because reading still works while it is outstanding.
public enum InventoryStorageError: Error, Hashable, Sendable {
    case full
}
