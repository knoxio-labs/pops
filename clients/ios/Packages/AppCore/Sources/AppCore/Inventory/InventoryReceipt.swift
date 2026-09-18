/// What `InventoryStore.perform(_:)` hands back: enough to undo the change
/// and to find it again in the sync ledger, and nothing about whether it has
/// reached the server yet. ADR-002's iOS replica design is explicit that a
/// view never learns which: `perform` returns once the change is durable, in
/// Phase A after the server's `applied` outcome and in Phase B after the
/// local commit, and a receipt is the same shape either way.
public struct InventoryReceipt: Identifiable, Hashable, Sendable {
    /// The idempotency key the store minted for this change (ADR-002 D9).
    public let mutationId: String
    public let entityKind: InventoryEntityKind
    public let entityId: String

    public init(mutationId: String, entityKind: InventoryEntityKind, entityId: String) {
        self.mutationId = mutationId
        self.entityKind = entityKind
        self.entityId = entityId
    }

    public var id: String { mutationId }
}
