/// Why the replica refused a page or could not read what it holds.
public enum InventoryReplicaError: Error, Hashable, Sendable {
    /// A change-feed page arrived before any snapshot completed. The feed is
    /// only meaningful after `since`, and there is no `since` yet.
    case notDownloaded
    /// A change-feed page belongs to a different server epoch than the one
    /// the replica was built from (ADR-002 D10). Revisions and `seq` do not
    /// compare across epochs, so the only safe response is a fresh snapshot.
    case epochMismatch(stored: String, received: String)
    /// A stored value does not decode into the vocabulary it was written
    /// from. The replica only ever writes decoded domain values, so this is
    /// corruption rather than a newer server's words.
    case corruptValue(String)
}
