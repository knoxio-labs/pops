/// Thrown when the phone itself has no room for a change, not the server:
/// by `InventoryStore.perform(_:)` or `download()`, and by the on-device
/// replica or its media cache. Raised both from ADR-002 D11's 200 MB
/// free-space probe checked ahead of a write (including before staging a
/// photo) and from SQLite's own `SQLITE_FULL` for a write that started
/// anyway. The only Inventory failure shown as an alert ("Storage full")
/// rather than a repair or a blocking sheet, because reading still works
/// while it is outstanding.
public enum InventoryStorageError: Error, Hashable, Sendable {
    case full
}
