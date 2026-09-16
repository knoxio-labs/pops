/// The unpacking states POPS-3987 asks for, built on the same
/// ``InventoryFoundationItem`` fixtures the rest of Inventory uses.
internal enum InventoryUnpackingFixtures {
    private typealias Foundation = InventoryFoundationFixtures

    /// Nothing placed yet: the box as it is the moment it is opened.
    internal static let justOpened = InventoryUnpackingState(
        containerName: "Moving crate 3",
        remaining: [Foundation.espresso, Foundation.screws, Foundation.cable, Foundation.tape]
    )

    /// Most of it placed, one new location created along the way.
    internal static let nearlyDone = InventoryUnpackingState(
        containerName: "Moving crate 3",
        remaining: [Foundation.tape],
        placedCount: 3,
        createdDestinations: ["Pantry shelf"]
    )

    /// Nothing left inside.
    internal static let allPlaced = InventoryUnpackingState(
        containerName: "Moving crate 3",
        remaining: [],
        placedCount: 4
    )
}
