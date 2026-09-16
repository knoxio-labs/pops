/// A move-out's worth of things no type covers yet.
///
/// Built so the matching rule has something to be wrong about: an item matched
/// through its note rather than its name, a tablecloth no Table type may
/// claim, a discarded item that has stopped counting, and one thing kept
/// untyped on purpose. `InventoryFoundationFixtures.untyped` is the first of
/// them rather than a second bag with a different name.
internal enum InventoryUntypedFixtures {
    private static func item(
        _ id: String,
        _ name: String,
        location: String,
        lifecycle: InventoryLifecycle = .active
    ) -> InventoryFoundationItem {
        InventoryFoundationItem(
            id: id, name: name, typeName: nil, placement: .direct(location: location),
            lifecycle: lifecycle)
    }

    internal static let canvasBag = InventoryUntypedItem(
        item: InventoryFoundationFixtures.untyped,
        note: "Came with the sewing machine. Drawstring, about 40 cm.",
        filed: "Today")

    internal static let sleepingBag = InventoryUntypedItem(
        item: item("sleeping-bag", "Sleeping bag, two season", location: "Hall cupboard"),
        note: "Compresses to about the size of a football. Zip sticks at the foot.",
        filed: "Today")

    /// Matched only through its note, which is the case the rule exists for:
    /// nothing in the name says what it is.
    internal static let tripod = InventoryUntypedItem(
        item: item("tripod", "Camera tripod", location: "Study"),
        note: "Ball head, in a padded case. One leg lock slips under weight.",
        filed: "Yesterday")

    internal static let tablecloth = InventoryUntypedItem(
        item: item("tablecloth", "Tablecloth, hand embroidered", location: "Hall cupboard"),
        note: "Seats eight. Do not machine wash.", filed: "Yesterday")

    internal static let bikePump = InventoryUntypedItem(
        item: item("bike-pump", "Track pump", location: "Garage"),
        note: "Presta and Schrader. Gauge reads about 10 psi high.", filed: "2 days ago")

    internal static let curtainRail = InventoryUntypedItem(
        item: item("curtain-rail", "Curtain rail, 2.4 m", location: "Garage"),
        note: "Two brackets taped to it. Came off the study window.", filed: "2 days ago")

    internal static let spareKeys = InventoryUntypedItem(
        item: item("spare-keys", "Spare keys, unlabelled", location: "Kitchen"),
        note: "Four on a ring. Two are almost certainly the old flat.", filed: "3 days ago")

    internal static let yogaMat = InventoryUntypedItem(
        item: item("yoga-mat", "Yoga mat", location: "Bedroom"),
        note: "Rolled, in the wardrobe. The grip has gone on one end.", filed: "3 days ago")

    internal static let paintTin = InventoryUntypedItem(
        item: item("paint-tin", "Paint, hallway white", location: "Garage"),
        note: "About a third left. Matched in 2024, the code is on the lid.",
        filed: "Last week")

    internal static let doormat = InventoryUntypedItem(
        item: item("doormat", "Doormat, coir", location: "Garage"),
        note: "The spare. Bristles flattened on one side.", filed: "Last week")

    internal static let stepLadder = InventoryUntypedItem(
        item: item("step-ladder", "Step ladder, three tread", location: "Garage"),
        note: "Aluminium. The top step wobbles, so it is a two tread really.",
        filed: "Last week")

    /// Nothing will ever share its shape, so it was answered rather than
    /// queued. The one exit from the queue that is not a deploy.
    internal static let sextant = InventoryUntypedItem(
        item: item("sextant", "Grandfather's sextant", location: "Study"),
        note: "In its box with the certificate. Not to be packed with the tools.",
        isKeptUntyped: true, filed: "Last month")

    /// Untyped and discarded. It must not be counted, offered or reviewed.
    internal static let airer = InventoryUntypedItem(
        item: item("airer", "Broken clothes airer", location: "Garage", lifecycle: .discarded),
        note: "Two struts snapped.", filed: "Last month")

    /// Eleven waiting, one kept, one gone. The count the queue shows is the
    /// first of those three, and these exist to make that non-obvious.
    internal static let all: [InventoryUntypedItem] = [
        canvasBag, sleepingBag, tripod, tablecloth, bikePump, curtainRail, spareKeys, yogaMat,
        paintTin, doormat, stepLadder, sextant, airer,
    ]

    /// The type the 2.4 update brings: the one the canvas bag failed to find.
    /// It covers three of the eleven, one of them only through its note.
    internal static let bagType = InventoryItemType(
        id: "bag", name: "Bag",
        fieldNames: ["Material", "Closure", "Capacity", "How it is carried"],
        terms: ["bag", "case", "holdall", "sack"],
        arrivedIn: "2.4")

    /// A type that already exists, gaining a field under items already on it.
    internal static let boxChange = InventoryTypeChange(
        type: InventoryItemType(
            id: "storage-box", name: "Storage box",
            fieldNames: ["Size", "Room it is for", "Fragile", "Sealed by"],
            terms: ["box", "crate"], arrivedIn: "1.0"),
        addedField: "Fragile", itemsAffected: 14, arrivedIn: "2.4")

    /// The types that exist before the 2.4 update, for the screen where a
    /// search through them finds nothing that fits. No Bag among them; that is
    /// what the arrival is for.
    internal static let existingTypeNames = [
        "Appliance", "Cable", "Document", "Fastener", "Light", "Power tool", "Storage box",
    ]
}
