/// Every state POPS-3980 requires the item detail page to survive, once each.
///
/// Built on ``InventoryFoundationFixtures`` rather than beside it: the same
/// television that anchors a row in a list is the one whose detail page a
/// reviewer opens here, so a change to what "television" means cannot drift
/// between the two.
internal enum InventoryItemDetailFixtures {
    private typealias Base = InventoryFoundationFixtures

    private static let cableFields = [
        InventoryDetailField(key: "End A", value: "USB-A"),
        InventoryDetailField(key: "End B", value: "USB-C"),
        InventoryDetailField(key: "Length", value: "1 m"),
        InventoryDetailField(key: "Data rate", value: "5 Gbps"),
        InventoryDetailField(key: "Braided", value: "Yes"),
    ]

    /// Filed after the fact, with nothing but a name. Sparse must stay
    /// useful, not merely short.
    internal static let sparse = InventoryItemDetail(
        item: Base.untyped,
        activity: [
            InventoryActivityEntry(
                id: "logged", verb: "Logged", subject: "in Garage", detail: "No type chosen yet",
                when: "3 weeks ago")
        ]
    )

    /// Richly documented electronics: photos, fields, provenance, a manual,
    /// a history. The other pole from sparse.
    internal static let rich = InventoryItemDetail(
        item: InventoryFoundationItem(
            id: Base.espresso.id, name: "Espresso machine", typeName: Base.espresso.typeName,
            code: Base.espresso.code, placement: Base.espresso.placement,
            sync: Base.espresso.sync),
        photos: [
            InventoryPhoto(
                caption: "Front, on the counter", isBroken: false,
                imageData: SamplePhoto.data("espresso-machine-1")),
            InventoryPhoto(
                caption: "Model plate", isBroken: false,
                imageData: SamplePhoto.data("espresso-machine-2")),
            InventoryPhoto(
                caption: "Steam wand", isBroken: false,
                imageData: SamplePhoto.data("espresso-machine-1")),
        ],
        externalIdentifiers: [
            InventoryDetailExternalIdentifier(kind: "Serial", value: "SN-88213-EU"),
            InventoryDetailExternalIdentifier(kind: "Model number", value: "ECM-SW-4"),
        ],
        description: "Descale every three weeks; the wand clogs first.",
        fields: [
            InventoryDetailField(key: "Brand", value: "Rancilio"),
            InventoryDetailField(key: "Boiler power", value: "1400 W"),
            InventoryDetailField(key: "Reservoir", value: "2.7 L"),
        ],
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
        ]
    )

    /// A record standing for many identical things in one placement.
    internal static let grouped = InventoryItemDetail(
        item: Base.screws,
        fields: [
            InventoryDetailField(key: "Material", value: "Steel, zinc-plated"),
            InventoryDetailField(key: "Length", value: "30 mm"),
        ]
    )

    /// Containment, which adds open and close to the action row and its
    /// contents to the page, and changes nothing else about it.
    internal static let container = InventoryItemDetail(
        item: Base.kitchenBox,
        photos: [
            InventoryPhoto(
                caption: "Packed, lid open", isBroken: false,
                imageData: SamplePhoto.data("moving-box"))
        ],
        fields: [
            InventoryDetailField(key: "Capacity", value: "52 L"),
            InventoryDetailField(key: "Width", value: "60 cm"),
            InventoryDetailField(key: "Height", value: "32 cm"),
            InventoryDetailField(key: "Depth", value: "40 cm"),
            InventoryDetailField(key: "Load limit", value: "20 kg"),
            InventoryDetailField(key: "Duty rating", value: "Heavy Duty"),
            InventoryDetailField(key: "Stackable", value: "Yes"),
        ],
        containerSummary: InventoryContainerSummary(itemCount: 12, containerCount: 0),
        activity: [
            InventoryActivityEntry(
                id: "opened", verb: "Opened in", subject: "Kitchen", detail: "Ready for packing",
                when: "1 hour ago")
        ]
    )

    /// Sitting in a room with no container between, the plain case the
    /// first action, Pick up, answers.
    internal static let directLocation = InventoryItemDetail(
        item: Base.television)

    /// Inside a container, itself sitting in a room. A cable, so the page
    /// carries the connection capability's action and section too.
    internal static let contained = InventoryItemDetail(
        item: Base.cable,
        photos: [
            InventoryPhoto(
                caption: "Coiled, both ends", isBroken: false,
                imageData: SamplePhoto.data("usb-cable"))
        ],
        fields: cableFields,
        connections: [
            InventoryConnection(port: "USB-A", attachedTo: "Desk hub"),
            InventoryConnection(port: "USB-C", attachedTo: nil),
        ]
    )

    /// Picked up and not yet put anywhere.
    internal static let inHand = InventoryItemDetail(item: Base.passport)

    internal static let discarded = InventoryItemDetail(
        item: Base.kettle,
        photos: [
            InventoryPhoto(
                caption: "On the counter", isBroken: false, imageData: SamplePhoto.data("kettle"))
        ],
        provenance: InventoryProvenance(
            merchant: "Homewares Co", price: "$49.00", purchasedOn: "3 Mar 2022",
            hasReceipt: true, warranty: nil),
        documents: .linked(["Receipt"]),
        activity: [
            InventoryLifecycleFixtures.lifecycle(
                "kettle-discarded", "Discarded", .discard, when: "3 Sep",
                month: "September 2026", reason: .donated),
            InventoryActivityEntry(
                id: "kettle-moved", verb: "Moved to", subject: "Garage", detail: "",
                when: "1 Sep", kind: .move, month: "September 2026", from: "Kitchen",
                to: "Garage", device: "iPhone"),
        ],
        lifecycleChange: InventoryLifecycleChange(
            lifecycle: .discarded, when: "3 Sep", reason: .donated))
    internal static let lost = InventoryItemDetail(
        item: Base.drill,
        photos: [
            InventoryPhoto(
                caption: "In the toolbox", isBroken: false,
                imageData: SamplePhoto.data("cordless-drill"))
        ],
        activity: [
            InventoryLifecycleFixtures.lifecycle(
                "drill-lost", "Marked lost", .lost, when: "28 Aug", month: "August 2026")
        ],
        lifecycleChange: InventoryLifecycleChange(lifecycle: .lost, when: "28 Aug"))
    internal static let destroyed = InventoryItemDetail(
        item: Base.lamp,
        photos: [
            InventoryPhoto(
                caption: "On the desk", isBroken: false,
                imageData: SamplePhoto.data("reading-lamp"))
        ],
        documents: .linked(["Receipt"]),
        activity: [
            InventoryLifecycleFixtures.lifecycle(
                "lamp-destroyed", "Destroyed", .destroyed, when: "12 Aug", month: "August 2026")
        ],
        lifecycleChange: InventoryLifecycleChange(lifecycle: .destroyed, when: "12 Aug"))

    /// Changed on this phone and not yet sent.
    internal static let queuedEdit: InventoryItemDetail = {
        var item = Base.cable
        item.sync = .queued
        return InventoryItemDetail(
            item: item,
            fields: cableFields,
            activity: [
                InventoryActivityEntry(
                    id: "moved", verb: "Moved to", subject: "Office 04", detail: "from Study",
                    when: "Just now")
            ])
    }()

    /// The local copy may not reflect the server any more.
    internal static let stale = InventoryItemDetail(
        item: InventoryFoundationItem(
            id: Base.tape.id, name: Base.tape.name, typeName: Base.tape.typeName, quantity: 3,
            placement: Base.tape.placement, sync: Base.tape.sync),
        lastSynced: "2 h ago")

    /// Documents exist, but the store that would show them did not answer.
    internal static let missingPaperless = InventoryItemDetail(
        item: Base.drill, documents: .paperlessUnavailable)

    /// A photo POPS has a record of and cannot draw.
    internal static let brokenPhoto = InventoryItemDetail(
        item: Base.linenBox,
        photos: [
            InventoryPhoto(
                caption: "Front, labelled", isBroken: false,
                imageData: SamplePhoto.data("moving-box")),
            InventoryPhoto(caption: "Contents, laid out", isBroken: true),
        ],
        fields: [
            InventoryDetailField(key: "Capacity", value: "32 L"),
            InventoryDetailField(key: "Width", value: "45 cm"),
            InventoryDetailField(key: "Height", value: "28 cm"),
            InventoryDetailField(key: "Depth", value: "35 cm"),
            InventoryDetailField(key: "Load limit", value: "12 kg"),
            InventoryDetailField(key: "Duty rating", value: "Standard"),
        ],
        containerSummary: InventoryContainerSummary(itemCount: 6, containerCount: 0)
    )

    /// Something worth recording, with nothing about how it was acquired.
    internal static let noProvenance = InventoryItemDetail(item: Base.screws)

    /// The server would not take a change made on this phone.
    internal static let conflicting = InventoryItemDetail(
        item: Base.conflicted,
        externalIdentifiers: [InventoryDetailExternalIdentifier(kind: "Serial", value: "RT-4471")],
        fields: [InventoryDetailField(key: "Wi-Fi standard", value: "802.11ax")],
        conflict: InventoryDetailConflict(
            problem: "Server discarded the move to Office 04",
            resolution: "Keep this phone's placement")
    )
}
