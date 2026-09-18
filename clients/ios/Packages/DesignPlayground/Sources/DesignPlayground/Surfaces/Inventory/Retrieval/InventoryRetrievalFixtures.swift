/// The things in hand POPS-3987 stages, built on the same items and sample
/// photos the rest of Inventory shows.
internal enum InventoryRetrievalFixtures {
    private typealias Foundation = InventoryFoundationFixtures

    internal static let passport = InventoryRetrievalItem(
        Foundation.passport, photo: SamplePhoto.data("passport"))

    internal static let router = InventoryRetrievalItem(
        InventoryFoundationItem(
            id: "router-hand", name: "Wi-Fi router", typeName: "Network",
            placement: .inHand(previous: "Office 04")),
        photo: SamplePhoto.data("wifi-router"))

    /// A grouped record: it moves whole.
    internal static let screws = InventoryRetrievalItem(
        InventoryFoundationItem(
            id: "screws-hand", name: "Wood screws, 4 × 30 mm", typeName: "Fastener", quantity: 24,
            placement: .inHand(previous: "Small parts tray")),
        photo: SamplePhoto.data("wood-screws"))

    /// Picked up out of a closed container; Put back still takes it there.
    internal static let album = InventoryRetrievalItem(
        InventoryFoundationItem(
            id: "photo-album", name: "Photo album from the trip to Lisbon in 2019",
            typeName: "Document", placement: .inHand(previous: "Linen 02")))

    internal static let extensionLead = InventoryRetrievalItem(
        InventoryFoundationItem(
            id: "extension-lead-hand", name: "Extension lead", typeName: "Cable",
            placement: .inHand(previous: "Study")))

    internal static let trophy = InventoryRetrievalItem(
        InventoryFoundationItem(
            id: "trophy-hand", name: "School trophy", typeName: nil,
            placement: .inHand(previous: "Old display shelf")),
        previousStatus: .deleted)

    internal static let queuedRemote = InventoryRetrievalItem(
        InventoryFoundationItem(
            id: "remote-hand", name: "TV remote", typeName: "Remote control",
            placement: .inHand(previous: "Living room"), sync: .queued))

    internal static let queuedPassport = InventoryRetrievalItem(
        InventoryFoundationItem(
            id: "passport", name: "Passport", typeName: "Document",
            placement: .inHand(previous: "Documents drawer"), sync: .queued),
        photo: SamplePhoto.data("passport"))

    internal static let many = [passport, router, screws, album, extensionLead]
    internal static let one = [passport]
    internal static let previousGone = [trophy, passport, router]
    internal static let queued = [queuedPassport, queuedRemote, router]

    /// The dashboard's In hand rows, drawn from the same records as the In
    /// hand page so the two read alike: the record with the same name when
    /// there is one, otherwise the row's own name and origin.
    internal static func dashboard(_ items: [InventoryItem]) -> [InventoryRetrievalItem] {
        items.map { item in
            if let known = many.first(where: { $0.item.name == item.name }) { return known }
            let origin: String? =
                if case .inHand(let origin, _) = item.context { origin } else { nil }
            return InventoryRetrievalItem(
                InventoryFoundationItem(
                    id: item.id, name: item.name, typeName: nil,
                    placement: .inHand(previous: origin)))
        }
    }

    internal static let recent: [InventoryDestination] =
        InventoryLocationFixtures.recentIDs.compactMap { InventoryLocationFixtures.home.node($0) }
        .map { InventoryDestination(place: $0, in: InventoryLocationFixtures.home) }

    /// Put back, at the top of the picker, when the item has somewhere to go.
    internal static func putBackDestination(_ retrieval: InventoryRetrievalItem)
        -> InventoryDestination?
    {
        guard InventoryRetrieval.canPutBack(retrieval), let previous = retrieval.previousPlacement
        else { return nil }
        return InventoryDestination(
            id: "put-back", name: "Put back", kind: .putBack, detail: previous)
    }
}
