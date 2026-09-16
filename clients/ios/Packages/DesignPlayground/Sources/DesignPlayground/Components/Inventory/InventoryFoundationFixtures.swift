/// Every state POPS-3979 requires a component to survive, once each.
///
/// Grouped by what they exercise rather than by what they are, because the
/// reviewer is looking for the state, not the object.
internal enum InventoryFoundationFixtures {
    // Placement: direct, contained, nested, in hand, carried.

    internal static let television = InventoryFoundationItem(
        id: "television", name: "Television", typeName: "Display", code: "K7Q2",
        placement: .direct(location: "Living room"))

    internal static let cable = InventoryFoundationItem(
        id: "cable", name: "USB-A to USB-C cable", typeName: "Cable",
        placement: .contained(location: "Study", containers: ["Office 04"]))

    internal static let screws = InventoryFoundationItem(
        id: "screws", name: "Wood screws, 4 × 30 mm", typeName: "Fastener", quantity: 120,
        placement: .contained(
            location: "Garage", containers: ["Garage tools", "Small parts tray"]),
        sync: .queued)

    internal static let passport = InventoryFoundationItem(
        id: "passport", name: "Passport", typeName: "Document",
        placement: .inHand(previous: "Documents drawer"), sync: .saved)

    /// Inside a container that is itself being carried, so there is no room
    /// to name — the effective location is genuinely unknown, not missing.
    internal static let espresso = InventoryFoundationItem(
        id: "espresso",
        name: "Espresso machine with the steam wand that needs descaling every three weeks",
        typeName: "Brewing equipment",
        code: "BREW-2026-0007-A",
        placement: .contained(location: nil, containers: ["Moving crate 3"]),
        sync: .synchronizing)

    // Containers: open, closed.

    internal static let kitchenBox = InventoryFoundationItem(
        id: "kitchen-12", name: "Kitchen 12", typeName: "Storage box", code: "B412", quantity: 1,
        placement: .direct(location: "Kitchen"), access: .open, sync: .synchronizing)

    internal static let linenBox = InventoryFoundationItem(
        id: "linen-02", name: "Linen 02", typeName: "Storage box", code: "B207",
        placement: .direct(location: "Hall cupboard"), access: .closed)

    // Quantity and missing metadata.

    internal static let tape = InventoryFoundationItem(
        id: "tape", name: "Gaffer tape", typeName: "Tape", quantity: 0,
        placement: .contained(location: "Garage", containers: ["Garage tools"]), sync: .stale)

    internal static let untyped = InventoryFoundationItem(
        id: "untyped", name: "Unlabelled canvas bag", typeName: nil,
        placement: .direct(location: "Garage"))

    // Lifecycle.

    internal static let kettle = InventoryFoundationItem(
        id: "kettle", name: "Old kettle", typeName: "Appliance",
        placement: .direct(location: "Garage"), lifecycle: .discarded)

    internal static let drill = InventoryFoundationItem(
        id: "drill", name: "Cordless drill", typeName: "Power tool", code: "T031",
        placement: .contained(location: "Garage", containers: ["Garage tools"]), lifecycle: .lost)

    internal static let lamp = InventoryFoundationItem(
        id: "lamp", name: "Reading lamp", typeName: "Light",
        placement: .direct(location: "Study"), lifecycle: .destroyed)

    // Sync failure.

    internal static let conflicted = InventoryFoundationItem(
        id: "router", name: "Wi-Fi router", typeName: "Network", code: "N004",
        placement: .contained(location: "Study", containers: ["Office 04"]),
        sync: .needsAttention)

    /// The set a gallery walks, in the order a reviewer should meet them.
    internal static let all: [InventoryFoundationItem] = [
        television, cable, screws, passport, espresso, kitchenBox, linenBox, tape, untyped,
        kettle, drill, lamp, conflicted,
    ]
}
