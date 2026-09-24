/// Changes made on this phone while the catalogue moved on under them: one
/// per way a field or type can be left behind, and the queue around them.
internal enum InventoryCatalogueFixtures {
    internal static let shieldingArchived = InventoryRepair(
        id: "cable-shielding", recordID: "cable", kind: .catalogueChanged,
        problem: "Shielding was archived",
        catalogue: InventoryCatalogueChange(
            title: "Queued edit",
            values: [
                InventoryQueuedValue(field: "Shielding", value: "Braided", fit: .archived),
                InventoryQueuedValue(field: "Length", value: "2 m"),
            ],
            retry: .refused("Shielding is still archived, so nothing was sent.")))

    internal static let screenReplaced = InventoryRepair(
        id: "television-screen", recordID: "television", kind: .catalogueChanged,
        problem: "Screen size was replaced by Diagonal",
        catalogue: InventoryCatalogueChange(
            title: "Queued edit",
            values: [
                InventoryQueuedValue(
                    field: "Screen size", value: "55 in", fit: .replaced(by: "Diagonal")),
                InventoryQueuedValue(field: "Panel", value: "OLED"),
            ],
            retry: .refused("Screen size is still replaced, so nothing was sent.")))

    internal static let typeReplaced = InventoryRepair(
        id: "router-type", recordID: "router", kind: .catalogueChanged,
        problem: "Network was replaced by Router",
        catalogue: InventoryCatalogueChange(
            title: "Queued type change",
            values: [
                InventoryQueuedValue(
                    field: "Type", value: "Network", fit: .replaced(by: "Router")),
                InventoryQueuedValue(field: "Wi-Fi standard", value: "802.11ax"),
                InventoryQueuedValue(field: "Ports", value: "4"),
            ],
            retry: .refused("Network is still replaced, so nothing was sent.")))

    internal static let optionRetired = InventoryRepair(
        id: "kitchen-colour", recordID: "kitchen-12", kind: .catalogueChanged,
        problem: "Sage was retired from Colour",
        catalogue: InventoryCatalogueChange(
            title: "Queued edit",
            values: [
                InventoryQueuedValue(field: "Colour", value: "Sage", fit: .optionRetired),
                InventoryQueuedValue(field: "Lid", value: "Hinged"),
            ],
            retry: .refused("Sage is still retired, so nothing was sent.")))

    internal static let nowRequired = InventoryRepair(
        id: "espresso-capacity", recordID: "espresso", kind: .catalogueChanged,
        problem: "Capacity is now required",
        catalogue: InventoryCatalogueChange(
            title: "Queued new item",
            values: [
                InventoryQueuedValue(field: "Capacity", value: "Not set", fit: .nowRequired),
                InventoryQueuedValue(field: "Boiler", value: "Dual"),
                InventoryQueuedValue(field: "Pressure", value: "15 bar"),
            ],
            retry: .refused("Capacity is still required, so nothing was sent.")))

    /// Authored against fields the server has and this phone does not yet.
    internal static let fieldsNotHere = InventoryRepair(
        id: "screws-head", recordID: "screws", kind: .catalogueChanged,
        problem: "This edit needs newer fields",
        catalogue: InventoryCatalogueChange(
            title: "Queued edit",
            values: [
                InventoryQueuedValue(field: "Head", value: "Countersunk", fit: .notOnPhone),
                InventoryQueuedValue(field: "Drive", value: "Pozidriv"),
            ],
            retry: .waitsForFields))

    /// The same edit once the newer fields have arrived: nothing is left in
    /// the way, and Retry sends it.
    internal static let fieldsArrived = InventoryRepair(
        id: "screws-head", recordID: "screws", kind: .catalogueChanged,
        problem: "This edit needs newer fields",
        catalogue: InventoryCatalogueChange(
            title: "Queued edit",
            values: [
                InventoryQueuedValue(field: "Head", value: "Countersunk"),
                InventoryQueuedValue(field: "Drive", value: "Pozidriv"),
            ],
            retry: .sends))

    /// Every catalogue repair the surface stages.
    internal static let everyRepair: [InventoryRepair] = [
        shieldingArchived, screenReplaced, typeReplaced, optionRetired, nowRequired,
        fieldsNotHere, fieldsArrived,
    ]

    /// Several changes the same catalogue publish left behind at once.
    internal static let several: [InventoryRepair] = [
        shieldingArchived, screenReplaced, typeReplaced, optionRetired,
    ]

    internal static let cableEdit = InventoryQueuedOperation(
        id: "edit-cable", recordID: "cable", symbol: .edit, title: "USB-A to USB-C cable",
        detail: "Edited", enqueued: 0, hold: .newFields)

    /// Queued after the cable's edit, so it waits for that edit's repair.
    internal static let cableRename = InventoryQueuedOperation(
        id: "rename-cable", recordID: "cable", symbol: .rename, title: "USB-A to USB-C cable",
        detail: "Renamed", enqueued: 1, dependsOn: "edit-cable", hold: .behindRepair)

    internal static let heldForFields: [InventoryQueuedOperation] = [
        cableEdit, InventorySyncFixtures.screwsCounted, InventorySyncFixtures.kettleDiscarded,
    ]

    internal static let heldForApp: [InventoryQueuedOperation] = heldForFields.map { operation in
        var copy = operation
        if copy.id == cableEdit.id { copy.hold = .appUpdate }
        return copy
    }

    /// Moved onto the newer fields on its own and on its way.
    internal static let movedAndSending: [InventoryQueuedOperation] = heldForFields.map { held in
        var copy = held
        if copy.id == cableEdit.id {
            copy.hold = nil
            copy.progress = 0.4
        }
        return copy
    }

    internal static let resolved: [InventoryResolvedEntry] =
        [
            InventoryResolvedEntry(
                id: "screws-head", recordID: "screws", outcome: "Sent with current fields",
                when: "Just now"),
            InventoryResolvedEntry(
                id: "cable-shielding", recordID: "cable", outcome: "Let go", when: "11:20"),
        ] + InventorySyncFixtures.resolved
}
