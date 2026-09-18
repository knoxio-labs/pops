/// The records POPS-3989's Lifecycle and History surfaces stage, built on
/// ``InventoryFoundationFixtures`` and the Item detail fixtures rather than
/// beside them, so an inactive item reads the same on every page.
internal enum InventoryLifecycleFixtures {
    private typealias Base = InventoryFoundationFixtures

    /// A grouped record: ten of one thing in one drawer, which is what
    /// "Discard all 10", Split and Change quantity are offered for.
    internal static let forks = InventoryItemDetail(
        item: InventoryFoundationItem(
            id: "forks", name: "Dinner forks", typeName: "Cutlery", quantity: 10,
            placement: .contained(location: "Kitchen", containers: ["Cutlery drawer"])),
        fields: [
            InventoryDetailField(key: "Material", value: "Stainless steel"),
            InventoryDetailField(key: "Set", value: "Everyday"),
        ],
        activity: [
            move("forks-in", "Moved to", "Cutlery drawer", when: "2 Sep", from: "Kitchen 12")
        ])

    /// Active, with nothing about its lifecycle yet: what Restore returns to
    /// and what Discard, Mark lost and Destroy start from.
    internal static let television = InventoryItemDetail(
        item: Base.television,
        photos: [
            InventoryPhoto(
                caption: "On the stand", isBroken: false,
                imageData: SamplePhoto.data("television"))
        ],
        activity: shortHistory)

    /// Retired: not broken or given away, just no longer in use. Also a
    /// Search and Items record, so the lists have one of every inactive word.
    internal static let retiredRouter = InventoryFoundationItem(
        id: "router-old", name: "Old Wi-Fi router", typeName: "Network", code: "N001",
        placement: .direct(location: "Study"), lifecycle: .retired)

    internal static let retired = InventoryItemDetail(
        item: retiredRouter,
        photos: [
            InventoryPhoto(
                caption: "Front", isBroken: false, imageData: SamplePhoto.data("wifi-router"))
        ],
        documents: .linked(["Setup guide"]),
        activity: [
            lifecycle("retired", "Retired", .retired, when: "14 Aug", month: "August 2026"),
            move(
                "router-moved", "Moved to", "Study", when: "2 Jul", month: "July 2026",
                from: "Hall cupboard"),
        ],
        lifecycleChange: InventoryLifecycleChange(lifecycle: .retired, when: "14 Aug"))

    /// Two events, the History page when an item has barely begun one.
    internal static let shortHistory: [InventoryActivityEntry] = [
        move(
            "tv-moved", "Moved to", "Living room", when: "Yesterday", from: "Kitchen 12",
            isUndoable: true),
        InventoryActivityEntry(
            id: "tv-logged", verb: "Logged", subject: "", detail: "", when: "12 Sep",
            kind: .edit, symbol: .addNew, month: "September 2026", device: "iPhone"),
    ]

    /// A year of an espresso machine: moves, a discard and its restore,
    /// edits, filed under the month each happened in.
    internal static let longHistory: [InventoryActivityEntry] = [
        move(
            "e-packed", "Packed into", "Moving crate 3", when: "Today", from: "Kitchen",
            isUndoable: true),
        edit("e-photo", "Added a photo", when: "Yesterday"),
        lifecycle(
            "e-restored", "Restored", .restore, when: "10 Sep", month: "September 2026"),
        lifecycle(
            "e-discarded", "Discarded", .discard, when: "9 Sep", month: "September 2026",
            reason: .broken),
        edit("e-note", "Edited the note", when: "2 Sep"),
        move(
            "e-counter", "Moved to", "Kitchen", when: "28 Aug", month: "August 2026",
            from: "Garage"),
        edit("e-warranty", "Added the warranty", when: "20 Aug", month: "August 2026"),
        move(
            "e-garage", "Moved to", "Garage", when: "11 Aug", month: "August 2026",
            from: "Kitchen"),
        edit("e-manual", "Linked the manual", when: "30 Jul", month: "July 2026"),
        move(
            "e-descale", "Picked up", "", when: "14 Jul", month: "July 2026", from: "Kitchen"),
        move(
            "e-back", "Put back in", "Kitchen", when: "14 Jul", month: "July 2026",
            from: "In hand"),
        edit("e-type", "Typed as Brewing equipment", when: "15 Feb 2025", month: "February 2025"),
        InventoryActivityEntry(
            id: "e-logged", verb: "Logged", subject: "", detail: "", when: "14 Feb 2025",
            kind: .edit, symbol: .addNew, month: "February 2025", device: "iPhone"),
    ]

    private static func move(
        _ id: String, _ verb: String, _ subject: String, when: String,
        month: String = "September 2026", from: String, isUndoable: Bool = false
    ) -> InventoryActivityEntry {
        InventoryActivityEntry(
            id: id, verb: verb, subject: subject, detail: "", when: when, kind: .move,
            month: month, from: from, to: subject.isEmpty ? "In hand" : subject,
            device: "iPhone", isUndoable: isUndoable)
    }

    private static func edit(
        _ id: String, _ verb: String, when: String, month: String = "September 2026"
    ) -> InventoryActivityEntry {
        InventoryActivityEntry(
            id: id, verb: verb, subject: "", detail: "", when: when, kind: .edit,
            month: month, device: "Web")
    }

    internal static func lifecycle(
        _ id: String, _ verb: String, _ symbol: InventorySymbol, when: String, month: String,
        reason: InventoryDiscardReason? = nil
    ) -> InventoryActivityEntry {
        InventoryActivityEntry(
            id: id, verb: verb, subject: "", detail: "", when: when, kind: .lifecycle,
            symbol: symbol, month: month, reason: reason, device: "iPhone")
    }
}
