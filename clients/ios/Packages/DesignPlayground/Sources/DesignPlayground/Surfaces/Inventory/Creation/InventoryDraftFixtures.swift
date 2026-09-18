/// One draft per condition the form has to survive.
///
/// The cast is the one the rest of Inventory is drawn against, and the values
/// are taken from those fixtures rather than retyped, so the cable being
/// recorded here is the same cable the properties screens compare.
internal enum InventoryDraftFixtures {
    /// Entered from the container the dashboard has open, which is the only
    /// thing that can pre-fill a destination.
    internal static let origin = InventoryCreationOrigin(
        container: "Kitchen 12", location: "Kitchen")

    private static var here: InventoryPlacementChoice {
        InventoryPlacementKind.currentContainer.choice(for: origin)
    }

    private static var cableValues: [InventoryProperty] {
        InventoryCableFixtures.cable.properties.filter { $0.origin == .template }
    }

    private static var chargerValues: [InventoryProperty] {
        InventoryPropertyFixtures.editing.properties.filter { $0.origin == .template } + [
            InventoryProperty("Folding pins", .flag(true)),
            InventoryProperty("Plug", .choice("Type I")),
        ]
    }

    internal static let blank = InventoryDraft(internalID: "itm-8f31", placement: here)

    /// A name and nothing else, which is already enough to create.
    internal static let named = InventoryDraft(
        internalID: "itm-8f31", name: "IKEA serving bowl", placement: here)

    internal static let photographed = InventoryDraft(
        internalID: "itm-8f31",
        name: "IKEA serving bowl",
        photos: [
            InventoryDraftPhoto(
                id: "ph-1", caption: "In the crate", upload: .uploaded,
                imageData: SamplePhoto.data("tote-bag")),
            InventoryDraftPhoto(
                id: "ph-2", caption: "Chip on the rim", upload: .uploading,
                imageData: SamplePhoto.data("gaffer-tape")),
            InventoryDraftPhoto(
                id: "ph-3", upload: .staged, imageData: SamplePhoto.data("wood-screws")),
        ],
        placement: here)

    /// A type chosen, and the fields it declares answered.
    internal static let typed = InventoryDraft(
        internalID: "itm-9c02",
        name: "USB-A to USB-C cable, 2 m",
        typeName: "Cable",
        values: cableValues,
        note: "The soft white one. Fine for charging overnight, useless for a drive.",
        placement: here)

    /// The same cable before anybody says what it is. Filing without a type is
    /// an answer, not a gap (ADR-001).
    internal static let untyped = InventoryDraft(
        internalID: "itm-9c02",
        name: "USB-A to USB-C cable, 2 m",
        placement: here)

    /// Ten identical things in one placement. Ten more in the garage would be
    /// a second record, not a second location on this one.
    internal static let grouped = InventoryDraft(
        internalID: "itm-3a77",
        name: "IKEA forks",
        quantity: 10,
        placement: here)

    internal static let inLocation = InventoryDraft(
        internalID: "itm-9c02",
        name: "USB-A to USB-C cable, 2 m",
        typeName: "Cable",
        values: cableValues,
        placement: .directLocation("Study"))

    internal static let inHand = InventoryDraft(
        internalID: "itm-9c02",
        name: "USB-A to USB-C cable, 2 m",
        typeName: "Cable",
        values: cableValues,
        placement: .inHand)

    /// The final action pressed with nothing in the name.
    internal static let unnamed = InventoryDraft(
        internalID: "itm-8f31",
        typeName: "Cable",
        values: cableValues,
        placement: here)

    /// An item that has been lived with: a type, its fields, a code, a serial
    /// and a photograph.
    internal static let rich = InventoryDraft(
        internalID: "itm-4d18",
        name: "GaN charger, 65 W",
        typeName: "Charger",
        values: chargerValues,
        note: "Travel one. The folding pins are why it is worth keeping.",
        code: InventoryCodeEntry(value: "PWR-0113", assist: .accepted),
        identifiers: [
            InventoryExternalIdentifier(id: "id-1", label: "Serial", value: "GN65-2204-118")
        ],
        photos: [
            InventoryDraftPhoto(
                id: "ph-1", caption: "Ports and rating", upload: .uploaded,
                imageData: SamplePhoto.data("usb-cable"))
        ],
        placement: .anotherContainer(container: "Office 04", location: "Study"))

    internal static func withCode(_ assist: InventoryCodeAssist, value: String = "")
        -> InventoryDraft
    {
        var draft = typed
        draft.code = InventoryCodeEntry(value: value, assist: assist)
        return draft
    }
}
