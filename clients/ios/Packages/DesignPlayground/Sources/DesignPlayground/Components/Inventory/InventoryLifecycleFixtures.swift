/// Why a lifecycle action did not go through, and what to do instead.
///
/// Distinct from ``InventoryRepairRow``'s sync conflict: this is not the
/// server disagreeing, it is the action itself no longer making sense because
/// something it depended on changed underneath it: a container that filled
/// back up while its "Discard" sheet was open, say.
internal struct InventoryLifecycleRejection: Identifiable, Equatable {
    internal let id: String
    internal let item: InventoryFoundationItem
    internal let attempted: String
    internal let reason: String
    internal let nextStep: String
}

/// Every state POPS-3989 requires, once each, built on
/// ``InventoryFoundationFixtures`` rather than beside it.
internal enum InventoryLifecycleFixtures {
    /// A reason for the items whose disposition carries one.
    /// ``InventoryFoundationItem`` has no field for this: ADR-001 does not
    /// give a discard a reason of its own, this ticket's own open question
    /// does, so the mapping lives here rather than growing the model.
    internal static let reasons: [String: InventoryDiscardReason] = [
        "old-sofa": .donated,
        "camera": .sold,
        "queued-kettle": .broken,
    ]

    // Partially reduced quantity: some of a group is gone, the rest still
    // counts.
    internal static let paintCans = InventoryFoundationItem(
        id: "paint-cans", name: "Cans of white paint", typeName: "Paint", quantity: 4,
        placement: .contained(location: "Garage", containers: ["Garage tools"]))

    // Fully inactive, with a reason attached.
    internal static let oldSofa = InventoryFoundationItem(
        id: "old-sofa", name: "Old sofa", typeName: "Furniture",
        placement: .direct(location: "Living room"), lifecycle: .discarded)

    // Restored: active again, after having been discarded once.
    internal static let restoredKettle = InventoryFoundationItem(
        id: "restored-kettle", name: "Electric kettle", typeName: "Appliance", code: "K118",
        placement: .direct(location: "Kitchen"), lifecycle: .active)

    // Offline queued disposition: discarded here, not yet told to the server.
    internal static let queuedDiscard = InventoryFoundationItem(
        id: "queued-kettle", name: "Broken kettle", typeName: "Appliance",
        placement: .direct(location: "Kitchen"), lifecycle: .discarded, sync: .queued)

    // Conflicting edit: this phone and the server do not agree on the state.
    internal static let conflictedLifecycle = InventoryFoundationItem(
        id: "camera", name: "Film camera", typeName: "Electronics", code: "E220",
        placement: .direct(location: "Study"), lifecycle: .discarded, sync: .needsAttention)

    // Container with contents: cannot become inactive while it still holds
    // things.
    internal static let packedBox = InventoryFoundationItem(
        id: "packed-box", name: "Winter clothes", typeName: "Storage box", code: "B331",
        quantity: 1, placement: .direct(location: "Hall cupboard"), access: .open)

    // Retired: not broken or given away, just no longer in use.
    internal static let retiredCamera = InventoryFoundationItem(
        id: "retired-camera", name: "First DSLR", typeName: "Electronics",
        placement: .direct(location: "Study"), lifecycle: .retired)

    internal static let rejection = InventoryLifecycleRejection(
        id: "reject-nonempty-container",
        item: packedBox,
        attempted: "Discard",
        reason: "It still holds 6 items.",
        nextStep: "Move or discard what is inside first")

    /// What "Recent work" and the restored kettle's history show, oldest
    /// first the way the ADR's timeline reads.
    internal static let timeline: [InventoryTimelineEvent] = [
        InventoryTimelineEvent(
            id: "t1", kind: .lifecycle, verb: "Discarded", subject: "Electric kettle",
            detail: "The heating element stopped working", when: "3 weeks ago",
            fullDetail:
                "Marked discarded on the phone. Reason: broke. Stopped counting toward totals."),
        InventoryTimelineEvent(
            id: "t2", kind: .lifecycle, verb: "Restored", subject: "Electric kettle",
            detail: "It was fixed after all", when: "2 days ago",
            fullDetail: "Restored to active. Counts toward totals again from this point.",
            isReversal: true),
        InventoryTimelineEvent(
            id: "t3", kind: .placement, verb: "Closed", subject: "Linen 02",
            detail: "19 items", when: "Yesterday"),
        InventoryTimelineEvent(
            id: "t4", kind: .lifecycle, verb: "Discarded", subject: "Old sofa",
            detail: "Donated", when: "Today",
            fullDetail:
                "Marked discarded on the phone. Reason: donated. Photos and purchase receipt "
                + "remain attached to the record."),
    ]
}
