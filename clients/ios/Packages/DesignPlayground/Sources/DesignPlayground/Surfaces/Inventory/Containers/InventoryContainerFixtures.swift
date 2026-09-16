/// Every container condition POPS-3986 requires, once each.
///
/// Separate items from ``InventoryFoundationFixtures`` because a profile
/// carries contents, properties and provenance that fixture does not model —
/// building one here rather than widening the foundation type keeps that
/// type's own contract, reviewed in POPS-3979, unchanged.
internal enum InventoryContainerFixtures {
    private static func item(
        id: String, name: String, code: String? = nil, quantity: Int = 1,
        location: String = "Garage", access: InventoryAccess? = .open,
        lifecycle: InventoryLifecycle = .active, sync: InventorySync = .synchronized
    ) -> InventoryFoundationItem {
        InventoryFoundationItem(
            id: id, name: name, typeName: "Storage box", code: code, quantity: quantity,
            placement: .direct(location: location), access: access, lifecycle: lifecycle,
            sync: sync)
    }

    private static func contentsItem(_ id: String, _ name: String, quantity: Int = 1)
        -> InventoryFoundationItem
    {
        InventoryFoundationItem(
            id: id, name: name, typeName: "Household", quantity: quantity,
            placement: .contained(location: "Garage", containers: ["Moving crate 3"]))
    }

    internal static let empty = InventoryContainerProfile(
        item: item(id: "crate-empty", name: "Moving crate 3", code: "B601"),
        sizeLoad: "Large · up to 20 kg",
        destinationHint: "Living room",
        purchaseProvenance: "Bought as a 5-pack, 2026-06-02",
        photoCount: 1)

    internal static let partial = InventoryContainerProfile(
        item: item(id: "crate-partial", name: "Moving crate 3", code: "B601"),
        sizeLoad: "Large · up to 20 kg",
        destinationHint: "Living room",
        purchaseProvenance: "Bought as a 5-pack, 2026-06-02",
        photoCount: 2,
        contents: InventoryContainerContents(
            items: [
                contentsItem("espresso", "Espresso machine"),
                contentsItem("cups", "Coffee cups", quantity: 6),
            ],
            recentlyAddedIDs: ["espresso"],
            recentlyRemovedNames: ["Kettle"]))

    internal static let full = InventoryContainerProfile(
        item: item(id: "crate-full", name: "Kitchen 12", code: "B412"),
        sizeLoad: "Large · up to 20 kg",
        destinationHint: "Kitchen",
        photoCount: 3,
        contents: InventoryContainerContents(
            items: (0..<18).map { contentsItem("kitchen-\($0)", "Kitchen item \($0 + 1)") },
            recentlyAddedIDs: ["kitchen-17"]),
        fullness: .declaredFull)

    internal static let closed = InventoryContainerProfile(
        item: item(id: "linen-02", name: "Linen 02", code: "B207", access: .closed),
        sizeLoad: "Medium · up to 10 kg",
        destinationHint: "Hall cupboard",
        contents: InventoryContainerContents(
            items: [contentsItem("towels", "Bath towels", quantity: 4)]))

    internal static let sealed = InventoryContainerProfile(
        item: item(id: "books-05", name: "Books 05", code: "B509", access: .sealed),
        sizeLoad: "Large · up to 20 kg",
        destinationHint: "Garage",
        contents: InventoryContainerContents(
            items: [contentsItem("books", "Paperbacks", quantity: 30)]))

    internal static let stored = InventoryContainerProfile(
        item: item(
            id: "decorations", name: "Christmas decorations", code: "B118",
            location: "Attic", access: .closed),
        sizeLoad: "Medium · up to 10 kg",
        purchaseProvenance: "Assembled from loose items, no single receipt",
        contents: InventoryContainerContents(
            items: [contentsItem("lights", "String lights", quantity: 3)]))

    internal static let retired = InventoryContainerProfile(
        item: item(
            id: "old-crate", name: "Old moving crate", code: "B004", access: .closed,
            lifecycle: .retired),
        sizeLoad: "Large · up to 20 kg",
        contents: InventoryContainerContents(
            items: [contentsItem("packing-paper", "Packing paper", quantity: 12)]))

    internal static let offline = InventoryContainerProfile(
        item: item(id: "crate-offline", name: "Moving crate 5", code: "B603", sync: .stale),
        sizeLoad: "Large · up to 20 kg",
        destinationHint: "Study",
        contents: InventoryContainerContents(
            items: [contentsItem("cables", "Cables", quantity: 8)]))

    internal static let needsAttention = InventoryContainerProfile(
        item: item(
            id: "crate-conflict", name: "Moving crate 6", code: "B604", sync: .needsAttention),
        sizeLoad: "Large · up to 20 kg",
        destinationHint: "Office 04",
        contents: InventoryContainerContents(
            items: [contentsItem("router-box", "Wi-Fi router")]))

    /// Not yet a container: eligible for the capability, and shown to
    /// demonstrate turning it on.
    internal static let capabilityEligible = InventoryContainerProfile(
        item: item(id: "spare-tote", name: "Spare tote", code: nil, access: nil),
        sizeLoad: "Medium · up to 10 kg",
        capabilityEligible: true)

    internal static let all: [InventoryContainerProfile] = [
        empty, partial, full, closed, sealed, stored, retired, offline, needsAttention,
        capabilityEligible,
    ]
}
