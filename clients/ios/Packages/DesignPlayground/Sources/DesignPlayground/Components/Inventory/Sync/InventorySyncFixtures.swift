/// An afternoon of packing with no signal, and every way it can end.
///
/// One story rather than a state per screen: the same six changes appear
/// queued, held, replaying and resolved, so a reviewer flipping between states
/// is watching one queue move rather than comparing six unrelated fixtures.
internal enum InventorySyncFixtures {
    private typealias Items = InventoryFoundationFixtures

    internal static let crateCreated = InventoryQueuedOperation(
        id: "create-crate", verb: "Added", subject: "Moving crate 3",
        detail: "Storage box · Garage", enqueued: 1, photoCount: 1)

    internal static let espressoMoved = InventoryQueuedOperation(
        id: "move-espresso", verb: "Moved", subject: "Espresso machine",
        detail: "Into Moving crate 3", enqueued: 2, photoCount: 3, dependsOn: "create-crate")

    internal static let screwsCounted = InventoryQueuedOperation(
        id: "count-screws", verb: "Counted", subject: "Wood screws, 4 × 30 mm",
        detail: "120 in Small parts tray", enqueued: 3)

    internal static let routerMoved = InventoryQueuedOperation(
        id: "move-router", verb: "Moved", subject: "Wi-Fi router",
        detail: "Into Office 04", enqueued: 4)

    internal static let kitchenClosed = InventoryQueuedOperation(
        id: "close-kitchen", verb: "Closed", subject: "Kitchen 12",
        detail: "18 items", enqueued: 5, photoCount: 2)

    internal static let passportPutBack = InventoryQueuedOperation(
        id: "put-back-passport", verb: "Put back", subject: "Passport",
        detail: "Into Documents drawer", enqueued: 6)

    /// What an ordinary offline afternoon leaves behind. Recorded out of
    /// order on purpose: the move into the crate was queued before the crate
    /// in wall-clock terms and has to replay after it.
    internal static let queued: [InventoryQueuedOperation] = [
        espressoMoved, crateCreated, screwsCounted, routerMoved, kitchenClosed, passportPutBack,
    ]

    /// The same queue part-way through a reconnect: two landed, one is on the
    /// wire, one failed, and everything behind the failure is held.
    internal static let replaying: [InventoryQueuedOperation] = [
        done(crateCreated), sending(espressoMoved), done(screwsCounted),
        attention(routerMoved), held(kitchenClosed), held(passportPutBack),
    ]

    /// A queue nobody wants to read one row at a time.
    internal static var many: [InventoryQueuedOperation] {
        queued
            + (0..<32).map { index in
                InventoryQueuedOperation(
                    id: "pack-\(index)", verb: "Put in", subject: "Book \(index + 1)",
                    detail: "Into Books 05", enqueued: 10 + index)
            }
    }

    internal static let concurrentEdit = InventoryConflict(
        id: "router-place", item: Items.conflicted, kind: .concurrentEdit,
        fields: [
            InventoryDisagreement(
                field: "Where it is", onThisPhone: "Office 04", elsewhere: "Hall cupboard",
                elsewhereName: "The web")
        ],
        heldCount: 2, when: "4 min ago")

    internal static let remoteDeletion = InventoryConflict(
        id: "office-gone", item: Items.cable, kind: .remoteDeletion, heldCount: 5,
        when: "4 min ago")

    internal static let codeCollision = InventoryConflict(
        id: "b412", item: Items.kitchenBox, kind: .codeCollision,
        fields: [
            InventoryDisagreement(
                field: "B412 is on", onThisPhone: "Kitchen 12", elsewhere: "Kitchen 09",
                elsewhereName: "The web")
        ],
        when: "4 min ago")

    internal static let validation = InventoryConflict(
        id: "screws-count", item: Items.screws, kind: .validation,
        fields: [
            InventoryDisagreement(
                field: "How many", onThisPhone: "1,400", elsewhere: "120", elsewhereName: "POPS")
        ],
        when: "4 min ago")

    internal static let expiredSession = InventoryConflict(
        id: "session", item: Items.espresso, kind: .expiredSession, heldCount: 13,
        when: "Just now")

    internal static let missingDependency = InventoryConflict(
        id: "crate-missing", item: Items.espresso, kind: .missingDependency, heldCount: 9,
        when: "1 min ago")

    internal static let storageFull = InventoryConflict(
        id: "storage", item: Items.kitchenBox, kind: .storageFull, heldCount: 11,
        when: "Just now")

    internal static let unsupportedContract = InventoryConflict(
        id: "contract", item: Items.untyped, kind: .unsupportedContract, heldCount: 11,
        when: "Just now")

    internal static let deviceDivergence = InventoryConflict(
        id: "divergence", item: Items.television, kind: .deviceDivergence,
        fields: [
            InventoryDisagreement(
                field: "Name", onThisPhone: "Living room TV", elsewhere: "Television",
                elsewhereName: "Your tablet"),
            InventoryDisagreement(
                field: "Where it is", onThisPhone: "Living room", elsewhere: "Moving crate 1",
                elsewhereName: "Your tablet"),
        ],
        when: "Yesterday")

    internal static let repairs: [InventoryConflict] = [
        concurrentEdit, remoteDeletion, codeCollision, validation, deviceDivergence,
    ]

    /// One of each, for the browser that has to show every repair's grammar.
    internal static let everyRepair: [InventoryConflict] = [
        concurrentEdit, remoteDeletion, codeCollision, validation, expiredSession,
        missingDependency, storageFull, unsupportedContract, deviceDivergence,
    ]

    internal static func repair(for kind: InventoryConflictKind) -> InventoryConflict {
        everyRepair.first { $0.kind == kind } ?? concurrentEdit
    }

    /// Repairs that settled themselves, kept because "it sorted itself out"
    /// is only believable when a person can see what it decided.
    internal static let resolved: [InventoryResolvedEntry] = [
        InventoryResolvedEntry(
            title: "Wood screws, 4 × 30 mm",
            outcome: "Counted here and on the web. Same number, kept.", when: "4 min ago"),
        InventoryResolvedEntry(
            title: "Linen 02", outcome: "Closed here while the web renamed it. Both kept.",
            when: "4 min ago"),
        InventoryResolvedEntry(
            title: "Reading lamp", outcome: "Marked destroyed here, already gone on the web.",
            when: "Yesterday"),
    ]

    private static func done(_ operation: InventoryQueuedOperation) -> InventoryQueuedOperation {
        with(operation, progress: .done)
    }

    private static func sending(_ operation: InventoryQueuedOperation) -> InventoryQueuedOperation {
        with(operation, progress: .sending)
    }

    private static func held(_ operation: InventoryQueuedOperation) -> InventoryQueuedOperation {
        with(operation, progress: .held)
    }

    private static func attention(
        _ operation: InventoryQueuedOperation
    ) -> InventoryQueuedOperation {
        with(operation, progress: .needsAttention)
    }

    private static func with(
        _ operation: InventoryQueuedOperation,
        progress: InventoryQueuedOperation.Progress
    ) -> InventoryQueuedOperation {
        var copy = operation
        copy.progress = progress
        return copy
    }
}
