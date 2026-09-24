/// Where a free inventory code suggestion (`POST /codes/suggest`, relayed by
/// bfm at `/mobile/inventory/codes/suggest`) comes from once a device is
/// paired.
///
/// Kept separate from ``InventorySyncTransport`` even though the wire route
/// sits beside it, because a screen that only ever wants a suggestion should
/// not gain the drain, mutation and media surface a sync transport carries —
/// `FeatureInventory`'s form seam takes a suggester closure for the same
/// reason, and this is the protocol the composition root builds one from.
public protocol InventoryCodeSuggestionService: Sendable {
    /// - Throws: ``InventorySyncTransportError/suggestionsUnavailable`` when
    ///   the server could not suggest one right now, or
    ///   ``InventorySyncTransportError/clientTooOld`` when this build is too
    ///   old to read the answer.
    func suggestCodes(name: String, typeKey: String?, stem: String?) async throws -> [String]
}
