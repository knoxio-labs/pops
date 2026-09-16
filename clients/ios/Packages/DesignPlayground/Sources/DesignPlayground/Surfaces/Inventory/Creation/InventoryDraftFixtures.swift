/// One draft per condition the create flow has to survive.
///
/// Every one of them is the same object at a different point in being
/// recorded, so switching states is a person's progress rather than a
/// different person's item.
internal enum InventoryDraftFixtures {
    internal static let origin = InventoryCreationOrigin(
        container: "Kitchen 12", location: "Kitchen")

    /// The types the build ships, as the picker offers them. A code artefact
    /// (ADR-001), so the list is fixed and filing under none of them is
    /// POPS-4016's screen rather than this one's.
    internal static let types = [
        "Appliance", "Brewing equipment", "Cable", "Document", "Fastener", "Storage box",
    ]

    internal static let blank = InventoryDraft(
        internalID: "itm-8f31",
        placement: InventoryPlacementKind.currentContainer.choice(for: origin))

    internal static let partial = InventoryDraft(
        internalID: "itm-8f31",
        name: "Espresso grinder",
        typeName: "Brewing equipment",
        placement: InventoryPlacementKind.currentContainer.choice(for: origin))

    /// Everything filled in, one photograph, ready for the final action.
    internal static let ready = InventoryDraft(
        internalID: "itm-8f31",
        name: "Espresso grinder",
        typeName: "Brewing equipment",
        note: "The burrs were replaced in March.",
        code: InventoryCodeEntry(value: "BREW-0042", assist: .accepted),
        identifiers: [
            InventoryExternalIdentifier(id: "id-1", label: "Serial", value: "EK43-118204")
        ],
        photos: [InventoryDraftPhoto(id: "ph-1", caption: "Hopper and dial")],
        placement: InventoryPlacementKind.currentContainer.choice(for: origin))

    internal static let multiPhoto = InventoryDraft(
        internalID: "itm-8f31",
        name: "Espresso grinder",
        typeName: "Brewing equipment",
        photos: [
            InventoryDraftPhoto(id: "ph-1", caption: "Hopper and dial"),
            InventoryDraftPhoto(id: "ph-2", caption: "Serial plate"),
            InventoryDraftPhoto(id: "ph-3"),
            InventoryDraftPhoto(id: "ph-4"),
        ],
        placement: InventoryPlacementKind.currentContainer.choice(for: origin))

    /// Four of the same thing in one placement. Ten in the garage as well
    /// would be a second record, not a second location on this one.
    internal static let grouped = InventoryDraft(
        internalID: "itm-8f31",
        name: "Wood screws, 4 x 30 mm",
        typeName: "Fastener",
        quantity: 48,
        placement: .anotherContainer(container: "Small parts tray", location: "Garage"))

    internal static let partialUpload = InventoryDraft(
        internalID: "itm-8f31",
        name: "Espresso grinder",
        typeName: "Brewing equipment",
        photos: [
            InventoryDraftPhoto(id: "ph-1", caption: "Hopper and dial", upload: .uploaded),
            InventoryDraftPhoto(id: "ph-2", caption: "Serial plate", upload: .uploading),
            InventoryDraftPhoto(
                id: "ph-3", upload: .failed("The third photo was refused as too large.")),
        ],
        placement: InventoryPlacementKind.currentContainer.choice(for: origin))

    internal static let duplicate = InventoryDraft.duplicating(
        InventoryFoundationFixtures.kitchenBox, internalID: "itm-c04a")

    /// The draft a relaunch finds. Not persisted by this package, which cannot
    /// reach disk: what is designed is the affordance that offers it back.
    internal static let resumable = partial

    internal static func withCode(_ assist: InventoryCodeAssist, value: String = "")
        -> InventoryDraft
    {
        var draft = partial
        draft.code = InventoryCodeEntry(value: value, assist: assist)
        return draft
    }
}
