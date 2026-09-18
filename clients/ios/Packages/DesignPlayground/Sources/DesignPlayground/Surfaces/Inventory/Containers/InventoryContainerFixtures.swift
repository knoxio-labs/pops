/// Every container condition POPS-3986 requires, once each, named the way the
/// dashboard names its open containers.
internal enum InventoryContainerFixtures {
    private static let boxFields = [
        InventoryDetailField(key: "Capacity", value: "52 L"),
        InventoryDetailField(key: "Load limit", value: "20 kg"),
        InventoryDetailField(key: "Stackable", value: "Yes"),
    ]

    private static func item(
        _ id: String, _ name: String, code: String?, location: String,
        access: InventoryAccess? = .open, type: String = "Storage box",
        lifecycle: InventoryLifecycle = .active, sync: InventorySync = .synchronized
    ) -> InventoryFoundationItem {
        InventoryFoundationItem(
            id: id, name: name, typeName: type, code: code,
            placement: .direct(location: location), access: access, lifecycle: lifecycle,
            sync: sync)
    }

    private static func contents(
        _ container: String, location: String, _ lines: [InventoryContainerLine]
    ) -> InventoryContainerContents {
        InventoryContainerContents(
            entries: lines.enumerated().map { index, line in
                InventoryContainedEntry(
                    item: InventoryFoundationItem(
                        id: "\(container)-\(index)", name: line.name, typeName: line.typeName,
                        quantity: line.quantity,
                        placement: .contained(location: location, containers: [container])),
                    added: added(index), isRecent: index < 3)
            })
    }

    private static func added(_ index: Int) -> String {
        switch index {
        case 0: "2 min ago"
        case 1: "8 min ago"
        case 2: "25 min ago"
        case 3..<8: "Today"
        default: "Yesterday"
        }
    }

    private static func activity(_ verb: String, _ subject: String, _ when: String)
        -> [InventoryActivityEntry]
    {
        [
            InventoryActivityEntry(
                id: "\(verb)-\(subject)", verb: verb, subject: subject, detail: "On this phone",
                when: when)
        ]
    }

    internal static let few = InventoryContainerProfile(
        detail: InventoryItemDetail(
            item: item("kitchen-12", "Kitchen 12", code: "B412", location: "Kitchen"),
            photos: [
                InventoryPhoto(
                    caption: "Packed, lid open", isBroken: false,
                    imageData: SamplePhoto.data("moving-box"))
            ],
            fields: boxFields,
            activity: activity("Opened in", "Kitchen", "1 hour ago")),
        contents: contents(
            "Kitchen 12", location: "Kitchen",
            [
                .init("Espresso machine", "Brewing equipment", 1),
                .init("Coffee cups", "Kitchenware", 6),
                .init("Milk jug, stainless steel with a measuring scale inside", "Kitchenware", 1),
            ]),
        updated: "8 min ago")

    internal static let empty = InventoryContainerProfile(
        detail: InventoryItemDetail(
            item: item(
                "crate-3", "Moving crate 3", code: "B601", location: "Living room",
                access: .closed),
            fields: boxFields,
            activity: activity("Closed in", "Living room", "Just now")),
        updated: "Just now")

    private static let officeLines: [InventoryContainerLine] = [
        .init("USB-A to USB-C cable", "Cable", 1), .init("Desk lamp", "Lighting", 1),
        .init("Notebooks", "Stationery", 5), .init("Monitor stand", "Furniture part", 1),
        .init("HDMI cable, 2 m", "Cable", 2), .init("Keyboard", "Computer accessory", 1),
        .init("Mouse", "Computer accessory", 1), .init("Headphones", "Audio", 1),
        .init("Webcam", "Computer accessory", 1), .init("Power strip", "Electrical", 1),
        .init("Pens", "Stationery", 12), .init("Sticky notes", "Stationery", 4),
        .init("Wi-Fi router", "Network", 1), .init("Ethernet cable, 5 m", "Cable", 3),
        .init("Laptop stand", "Computer accessory", 1), .init("Document tray", "Stationery", 2),
        .init("Stapler", "Stationery", 1), .init("External drive", "Storage", 2),
        .init("Microphone", "Audio", 1), .init("Desk mat", "Computer accessory", 1),
        .init("Cable ties", "Fastener", 40), .init("Phone charger", "Charger", 2),
        .init("Speaker", "Audio", 1), .init("Label printer", "Printer", 1),
    ]

    internal static let many = InventoryContainerProfile(
        detail: InventoryItemDetail(
            item: item("office-04", "Office 04", code: "B404", location: "Study"),
            photos: [
                InventoryPhoto(
                    caption: "Half packed", isBroken: false,
                    imageData: SamplePhoto.data("moving-box"))
            ],
            fields: boxFields,
            activity: activity("Opened in", "Study", "Yesterday")),
        contents: contents("Office 04", location: "Study", officeLines),
        updated: "Yesterday")

    internal static let garageTools = InventoryContainerProfile(
        detail: InventoryItemDetail(
            item: item("garage-tools", "Garage tools", code: "B318", location: "Garage"),
            fields: boxFields,
            activity: activity("Opened in", "Garage", "Monday")),
        contents: contents(
            "Garage tools", location: "Garage",
            [
                .init("Cordless drill", "Power tool", 1), .init("Gaffer tape", "Tape", 3),
                .init("Wood screws, 4 × 30 mm", "Fastener", 120),
                .init("Spirit level", "Hand tool", 1),
                .init("Tape measure", "Hand tool", 1), .init("Work gloves", "Safety", 2),
                .init("Extension lead", "Electrical", 1),
            ]),
        updated: "Monday")

    internal static let full = InventoryContainerProfile(
        detail: InventoryItemDetail(
            item: item(
                "books-05", "Books 05", code: "B509", location: "Study", access: .closed),
            fields: boxFields,
            activity: activity("Marked full in", "Study", "10 min ago")),
        contents: contents(
            "Books 05", location: "Study",
            [
                .init("Paperbacks", "Book", 30), .init("Cookbooks", "Book", 8),
                .init("Atlas", "Book", 1), .init("Photo albums", "Album", 4),
            ]),
        isFull: true,
        updated: "10 min ago")

    internal static let closed = InventoryContainerProfile(
        detail: InventoryItemDetail(
            item: item(
                "linen-02", "Linen 02", code: "B207", location: "Hall cupboard", access: .closed),
            fields: boxFields,
            activity: activity("Closed in", "Hall cupboard", "Monday")),
        contents: contents(
            "Linen 02", location: "Hall cupboard",
            [
                .init("Bath towels", "Linen", 4), .init("Duvet cover", "Linen", 2),
                .init("Pillowcases", "Linen", 6),
            ]
        ),
        updated: "Monday")

    internal static let stored = InventoryContainerProfile(
        detail: InventoryItemDetail(
            item: item(
                "decorations", "Christmas decorations", code: "B118", location: "Garage",
                access: .closed),
            photos: [
                InventoryPhoto(
                    caption: "Labelled lid", isBroken: false,
                    imageData: SamplePhoto.data("moving-box"))
            ],
            fields: boxFields,
            activity: activity("Closed in", "Garage", "8 months ago")),
        contents: contents(
            "Christmas decorations", location: "Garage",
            [
                .init("String lights", "Lighting", 3), .init("Baubles", "Decoration", 48),
                .init("Tree stand", "Decoration", 1), .init("Wreath", "Decoration", 1),
            ]),
        updated: "8 months ago")

    internal static let furniture = InventoryContainerProfile(
        detail: InventoryItemDetail(
            item: item(
                "drawers", "Chest of drawers", code: "F002", location: "Bedroom", access: nil,
                type: "Furniture"),
            fields: [
                InventoryDetailField(key: "Drawers", value: "4"),
                InventoryDetailField(key: "Material", value: "Oak"),
            ]),
        contents: contents(
            "Chest of drawers", location: "Bedroom",
            [.init("Winter jumpers", "Clothing", 6), .init("Passport wallet", "Document", 1)]),
        isFurniture: true,
        updated: "Last week")

    internal static let retired = InventoryContainerProfile(
        detail: InventoryItemDetail(
            item: item(
                "old-crate", "Old moving crate", code: "B004", location: "Garage",
                access: .closed, lifecycle: .retired),
            activity: activity("Retired in", "Garage", "Last month")),
        contents: contents(
            "Old moving crate", location: "Garage", [.init("Packing paper", "Packing", 12)]),
        updated: "Last month")

    internal static let stale = InventoryContainerProfile(
        detail: InventoryItemDetail(
            item: item(
                "crate-5", "Moving crate 5", code: "B603", location: "Garage", access: .closed,
                sync: .stale),
            fields: boxFields,
            lastSynced: "3 h ago"),
        contents: contents(
            "Moving crate 5", location: "Garage",
            [.init("Garden hose", "Garden", 1), .init("Trowels", "Garden", 3)]),
        updated: "3 h ago")
}

extension InventoryContainerFixtures {
    /// The dashboard's three open containers, and the rest of the catalogue:
    /// every container the Locations fixtures place, and no other.
    internal static let all: [InventoryContainerProfile] = [
        few, many, garageTools, stale, empty, full, closed, stored, furniture, retired,
    ]

    internal static let catalogue: [InventoryContainerProfile] =
        all
        + (1...14).map { index in
            InventoryContainerProfile(
                detail: InventoryItemDetail(
                    item: item(
                        "box-\(index)", "Moving crate \(index + 10)", code: "B7\(index + 10)",
                        location: ["Garage", "Spare room", "Hall cupboard"][index % 3],
                        access: .closed)),
                contents: contents(
                    "Moving crate \(index + 10)", location: "Garage",
                    Array(officeLines.prefix(index % 6 + 1))),
                isFull: index % 4 == 0,
                updated: "Last week")
        }

    /// What Store here can offer: things not already in the container.
    internal static let storable: [InventoryFoundationItem] = [
        InventoryFoundationFixtures.television,
        InventoryFoundationFixtures.passport,
        InventoryFoundationFixtures.screws,
        InventoryFoundationFixtures.tape,
        InventoryFoundationFixtures.drill,
        InventoryFoundationFixtures.cable,
        InventoryFoundationFixtures.linenBox,
        InventoryFoundationFixtures.kitchenBox,
    ]
}

private struct InventoryContainerLine {
    let name: String
    let typeName: String
    let quantity: Int

    init(_ name: String, _ typeName: String, _ quantity: Int) {
        self.name = name
        self.typeName = typeName
        self.quantity = quantity
    }
}
