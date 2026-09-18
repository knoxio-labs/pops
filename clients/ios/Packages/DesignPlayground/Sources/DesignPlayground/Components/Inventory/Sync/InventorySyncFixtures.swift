/// An afternoon of packing with no signal: the six changes it left, the
/// repairs that came back, and what settled.
internal enum InventorySyncFixtures {
    internal static let crateCreated = InventoryQueuedOperation(
        id: "create-crate", symbol: .create, title: "Moving crate 3", detail: "Added · Garage",
        enqueued: 1)

    internal static let espressoMoved = InventoryQueuedOperation(
        id: "move-espresso", recordID: "espresso", symbol: .move, title: "Espresso machine",
        detail: "Moved · Moving crate 3", enqueued: 0, dependsOn: "create-crate")

    internal static let screwsCounted = InventoryQueuedOperation(
        id: "count-screws", recordID: "screws", symbol: .edit, title: "Wood screws",
        detail: "Counted · 120", enqueued: 3)

    internal static let kettleDiscarded = InventoryQueuedOperation(
        id: "discard-kettle", recordID: "kettle", symbol: .discard, title: "Old kettle",
        detail: "Discarded · Donated", enqueued: 4)

    internal static let kitchenClosed = InventoryQueuedOperation(
        id: "close-kitchen", recordID: "kitchen-12", symbol: .close, title: "Kitchen 12",
        detail: "Closed · 18 items", enqueued: 5)

    internal static let passportPutBack = InventoryQueuedOperation(
        id: "put-back-passport", recordID: "passport", symbol: .restore, title: "Passport",
        detail: "Put back · Documents drawer", enqueued: 6)

    /// Recorded out of order on purpose: the move into the crate was queued
    /// before the crate and replays after it.
    internal static let waiting: [InventoryQueuedOperation] = [
        espressoMoved, crateCreated, screwsCounted, kettleDiscarded, kitchenClosed,
        passportPutBack,
    ]

    /// The same queue on reconnect: the first change nearly sent, the second
    /// just started.
    internal static let sending: [InventoryQueuedOperation] = waiting.map { operation in
        var copy = operation
        switch operation.id {
        case crateCreated.id: copy.progress = 0.8
        case espressoMoved.id: copy.progress = 0.3
        default: break
        }
        return copy
    }

    internal static let placement = InventoryRepair(
        id: "router-placement", recordID: "router", kind: .conflict,
        problem: "Moved on iPad too", field: "Placement",
        options: [
            InventoryRepairOption(value: "Office 04", source: .thisPhone, when: "4 min ago"),
            InventoryRepairOption(value: "Hall cupboard", source: .iPad, when: "12 min ago"),
        ])

    internal static let name = InventoryRepair(
        id: "television-name", recordID: "television", kind: .conflict,
        problem: "Renamed on the server too", field: "Name",
        options: [
            InventoryRepairOption(value: "Living room TV", source: .thisPhone, when: "Yesterday"),
            InventoryRepairOption(value: "Samsung television", source: .server, when: "2 h ago"),
        ])

    internal static let code = InventoryRepair(
        id: "kitchen-code", recordID: "kitchen-12", kind: .codeCollision,
        problem: "B412 is on Kitchen 09", suggestedCode: "B413")

    internal static let deleted = InventoryRepair(
        id: "cable-deleted", recordID: "cable", kind: .deletedElsewhere,
        problem: "Deleted on iPad")

    internal static let photo = InventoryRepair(
        id: "espresso-photo", recordID: "espresso", kind: .photoFailed,
        problem: "Photo too large to upload")

    /// What the Sync page lists under Needs attention.
    internal static let repairs: [InventoryRepair] = [placement, code, photo]

    /// Every kind the repair page stages.
    internal static let everyRepair: [InventoryRepair] = [placement, name, code, deleted, photo]

    internal static let resolved: [InventoryResolvedEntry] = [
        InventoryResolvedEntry(
            id: "linen", recordID: "linen-02", outcome: "Kept Hall cupboard", when: "10:42"),
        InventoryResolvedEntry(
            id: "tape", recordID: "tape", outcome: "Same count on both", when: "09:15"),
        InventoryResolvedEntry(
            id: "drill", recordID: "drill", outcome: "Photo sent", when: "08:03"),
        InventoryResolvedEntry(
            id: "lamp", recordID: "lamp", outcome: "Let go", when: "Yesterday", isToday: false),
    ]
}
