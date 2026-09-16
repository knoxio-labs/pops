/// Every state POPS-3980 requires the item detail page to survive, once each.
///
/// Built on ``InventoryFoundationFixtures`` rather than beside it: the same
/// television that anchors a row in the foundations gallery is the one whose
/// detail page a reviewer opens here, so a change to what "television" means
/// cannot drift between the two.
internal enum InventoryItemDetailFixtures {
    private typealias Base = InventoryFoundationFixtures

    /// Filed after the fact, with nothing but a name. Sparse must stay
    /// useful, not merely short.
    internal static let sparse = InventoryItemDetail(
        item: Base.untyped,
        photos: [],
        externalIdentifiers: [],
        description: nil,
        fields: [],
        capabilities: [],
        previousPlacement: nil,
        containerSummary: nil,
        provenance: nil,
        documents: .none,
        activity: [
            InventoryActivityEntry(
                id: "logged", verb: "Logged", subject: "in Garage", detail: "No type chosen yet",
                when: "3 weeks ago")
        ],
        conflict: nil
    )

    /// Richly documented electronics: photos, fields, provenance, a manual,
    /// a history. The information-hierarchy experiment's other pole.
    internal static let rich = InventoryItemDetail(
        item: Base.espresso,
        photos: [
            InventoryPhoto(caption: "Front, on the counter", isBroken: false),
            InventoryPhoto(caption: "Model plate", isBroken: false),
            InventoryPhoto(caption: "Steam wand", isBroken: false),
        ],
        externalIdentifiers: [
            InventoryExternalIdentifier(kind: "Serial", value: "SN-88213-EU"),
            InventoryExternalIdentifier(kind: "Model number", value: "ECM-SW-4"),
        ],
        description: "Descale every three weeks; the wand clogs first.",
        fields: [
            InventoryDetailField(key: "Brand", value: "Rancilio"),
            InventoryDetailField(key: "Boiler power", value: "1400 W"),
            InventoryDetailField(key: "Reservoir", value: "2.7 L"),
        ],
        capabilities: [],
        previousPlacement: "Kitchen",
        containerSummary: nil,
        provenance: InventoryProvenance(
            merchant: "Bean & Barrel", price: "$612.00", purchasedOn: "14 Feb 2025",
            hasReceipt: true, warranty: "2 years, to 14 Feb 2027"),
        documents: .linked(["Instruction manual", "Descaling schedule"]),
        activity: [
            InventoryActivityEntry(
                id: "packed", verb: "Packed into", subject: "Moving crate 3",
                detail: "from Kitchen",
                when: "2 days ago"),
            InventoryActivityEntry(
                id: "descaled", verb: "Noted", subject: "descaled", detail: "Routine maintenance",
                when: "3 weeks ago"),
        ],
        conflict: nil
    )

    /// A record standing for many identical things in one placement.
    internal static let grouped = InventoryItemDetail(
        item: Base.screws,
        photos: [],
        externalIdentifiers: [],
        description: nil,
        fields: [
            InventoryDetailField(key: "Material", value: "Steel, zinc-plated"),
            InventoryDetailField(key: "Length", value: "30 mm"),
        ],
        capabilities: [],
        previousPlacement: nil,
        containerSummary: nil,
        provenance: nil,
        documents: .none,
        activity: [],
        conflict: nil
    )

    /// Grants the containment capability. What that adds to an ordinary
    /// item's page, and only that, is the container-extension experiment's
    /// question.
    internal static let container = InventoryItemDetail(
        item: Base.kitchenBox,
        photos: [InventoryPhoto(caption: "Packed, lid open", isBroken: false)],
        externalIdentifiers: [],
        description: nil,
        fields: [],
        capabilities: ["Can hold other items"],
        previousPlacement: nil,
        containerSummary: InventoryContainerSummary(itemCount: 12, containerCount: 0),
        provenance: nil,
        documents: .none,
        activity: [
            InventoryActivityEntry(
                id: "opened", verb: "Opened in", subject: "Kitchen", detail: "Ready for packing",
                when: "1 hour ago")
        ],
        conflict: nil
    )

    /// Sitting in a room with no container between, the plain case the
    /// primary action, Pick up, answers.
    internal static let directLocation = detail(for: Base.television, previousPlacement: "Garage")

    /// Inside a container, itself sitting in a room.
    internal static let contained = detail(for: Base.cable)

    /// Picked up and not yet put anywhere.
    internal static let inHand = detail(for: Base.passport)

    internal static let discarded = detail(for: Base.kettle)
    internal static let lost = detail(for: Base.drill)
    internal static let destroyed = detail(for: Base.lamp)

    /// Changed on this phone and not yet sent.
    internal static let queuedEdit: InventoryItemDetail = {
        var item = Base.cable
        item.sync = .queued
        return detail(
            for: item, previousPlacement: "Study, loose",
            activity: [
                InventoryActivityEntry(
                    id: "moved", verb: "Moved to", subject: "Office 04", detail: "from Study",
                    when: "Just now")
            ])
    }()

    /// The local copy may not reflect the server any more.
    internal static let stale = detail(for: Base.tape)

    /// Documents exist, but the store that would show them did not answer.
    internal static let missingPaperless: InventoryItemDetail = {
        let base = detail(for: Base.drill)
        return InventoryItemDetail(
            item: base.item, photos: base.photos, externalIdentifiers: base.externalIdentifiers,
            description: base.description, fields: base.fields, capabilities: base.capabilities,
            previousPlacement: base.previousPlacement, containerSummary: base.containerSummary,
            provenance: base.provenance, documents: .paperlessUnavailable, activity: base.activity,
            conflict: base.conflict)
    }()

    /// A photo POPS has a record of and cannot draw.
    internal static let brokenPhoto = InventoryItemDetail(
        item: Base.linenBox,
        photos: [
            InventoryPhoto(caption: "Front, labelled", isBroken: false),
            InventoryPhoto(caption: "Contents, laid out", isBroken: true),
        ],
        externalIdentifiers: [],
        description: nil,
        fields: [],
        capabilities: ["Can hold other items"],
        previousPlacement: nil,
        containerSummary: InventoryContainerSummary(itemCount: 6, containerCount: 0),
        provenance: nil,
        documents: .none,
        activity: [],
        conflict: nil
    )

    /// Something worth recording, with nothing about how it was acquired.
    internal static let noProvenance = detail(for: Base.screws)

    /// The server would not take a change made on this phone.
    internal static let conflicting = InventoryItemDetail(
        item: Base.conflicted,
        photos: [],
        externalIdentifiers: [InventoryExternalIdentifier(kind: "Serial", value: "RT-4471")],
        description: nil,
        fields: [InventoryDetailField(key: "Wi-Fi standard", value: "802.11ax")],
        capabilities: [],
        previousPlacement: nil,
        containerSummary: nil,
        provenance: nil,
        documents: .none,
        activity: [],
        conflict: InventoryConflict(
            problem: "Moved on this phone to Office 04; the server has it discarded.",
            resolution: "Keep this phone's placement"))

    /// A plain wrapper for a foundation fixture that needs nothing extra.
    private static func detail(
        for item: InventoryFoundationItem,
        previousPlacement: String? = nil,
        activity: [InventoryActivityEntry] = []
    ) -> InventoryItemDetail {
        InventoryItemDetail(
            item: item, photos: [], externalIdentifiers: [], description: nil, fields: [],
            capabilities: [], previousPlacement: previousPlacement, containerSummary: nil,
            provenance: nil, documents: .none, activity: activity, conflict: nil)
    }
}
