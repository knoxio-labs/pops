/// Every state POPS-3987 asks retrieval to survive, once each.
///
/// Builds on ``InventoryFoundationFixtures`` rather than duplicating it: an
/// in-hand item is still the same ``InventoryFoundationItem`` a dashboard row
/// would show, wrapped in ``InventoryRetrievalItem`` for what retrieval alone
/// needs to know about the step back.
internal enum InventoryRetrievalFixtures {
    private typealias Foundation = InventoryFoundationFixtures

    /// Ordinary put-back: previous placement current, not a container.
    internal static let passport = InventoryRetrievalItem(Foundation.passport)

    /// The previous placement may have changed since it was recorded.
    internal static let staleRouter = InventoryRetrievalItem(
        InventoryFoundationItem(
            id: "router-hand", name: "Wi-Fi router", typeName: "Network",
            placement: .inHand(previous: "Office 04"), sync: .saved),
        previousStatus: .stale)

    /// The room or container it names has since been removed from the
    /// catalogue. Put back has nowhere to press.
    internal static let deletedShelf = InventoryRetrievalItem(
        InventoryFoundationItem(
            id: "trophy-hand", name: "School trophy", typeName: nil,
            placement: .inHand(previous: "Old display shelf"), sync: .saved),
        previousStatus: .deleted)

    /// Picked up out of a container that was closed, so put back reopens it.
    internal static let fromClosedBox = InventoryRetrievalItem(
        InventoryFoundationItem(
            id: "photo-album", name: "Photo album", typeName: "Document",
            placement: .inHand(previous: "Linen 02"), sync: .saved),
        previousWasClosedContainer: true)

    /// Change is queued because the phone is offline. Put back still works;
    /// it just has not left the phone yet.
    internal static let queuedMove = InventoryRetrievalItem(
        InventoryFoundationItem(
            id: "remote-hand", name: "TV remote", typeName: "Remote control",
            placement: .inHand(previous: "Living room"), sync: .queued))

    /// The server disagreed about where this ended up.
    internal static let conflicted = InventoryRetrievalItem(
        InventoryFoundationItem(
            id: "router-conflict", name: "Wi-Fi router", typeName: "Network",
            placement: .inHand(previous: "Office 04"), sync: .needsAttention))

    /// A quantity greater than one: retrieval moves the whole group or
    /// nothing, and this is the fixture that makes that visible.
    internal static let screwsInHand = InventoryRetrievalItem(
        InventoryFoundationItem(
            id: "screws-hand", name: "Wood screws, 4 × 30 mm", typeName: "Fastener", quantity: 24,
            placement: .inHand(previous: "Small parts tray"), sync: .saved))

    /// Nothing in hand.
    internal static let none: [InventoryRetrievalItem] = []

    /// Exactly one.
    internal static let one: [InventoryRetrievalItem] = [passport]

    /// Several, spanning the ordinary case and every exceptional one, so the
    /// full list is where a reviewer meets all of them together.
    internal static let many: [InventoryRetrievalItem] = [
        passport, staleRouter, deletedShelf, fromClosedBox, queuedMove, conflicted, screwsInHand,
    ]

    /// One completed move, for the undo state.
    internal static let undoableMove = (
        subject: "Cordless drill", from: "Garage tools", to: "Workbench", when: "2 min ago"
    )
}
