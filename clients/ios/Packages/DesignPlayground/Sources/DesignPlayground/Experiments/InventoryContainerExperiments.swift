/// The four questions POPS-3986 leaves open. Close-versus-seal is
/// POPS-3979's `inventory-close-seal`, still open there and not repeated
/// here; every variant below draws the container-detail or open-containers
/// surface with one knob turned and the rest at ``InventoryContainerStyle``'s
/// default.
internal enum InventoryContainerExperiments {
    @MainActor internal static let all: [DesignExperiment] = [
        detailStructure, openRepresentation, fullDeclaration, destinationField,
    ]

    private static let detailSubject = SurfaceID(area: "inventory", slug: "container-detail")
    private static let openSubject = SurfaceID(area: "inventory", slug: "open-containers")

    @MainActor private static let detailStructure = DesignExperiment(
        id: "inventory-container-detail-structure",
        question:
            "Is a container's workspace a section inside its item detail, or a screen detail links to?",
        subject: detailSubject,
        variants: [
            detailVariant(
                "unified-section", "Unified section",
                note: "Contents, search and add all sit inside the item detail's own scroll.",
                structure: .unifiedSection),
            detailVariant(
                "dedicated-workspace", "Dedicated workspace",
                note:
                    "Detail shows a one-line summary and a link; packing happens on its own screen. "
                    + "Current default.",
                structure: .dedicatedWorkspace),
        ]
    )

    @MainActor private static let openRepresentation = DesignExperiment(
        id: "inventory-open-containers-representation",
        question: "How should several simultaneous open containers be shown together?",
        subject: openSubject,
        variants: [
            openVariant(
                "list", "Plain list",
                note: "One row per open container, no shared frame.",
                representation: .list),
            openVariant(
                "grouped-card", "One card, several rows",
                note:
                    "Every open container inside one warm-toned card, matching the dashboard's own "
                    + "open-containers panel. Current default.",
                representation: .groupedCard),
            openVariant(
                "individual-cards", "One card each",
                note:
                    "Each open container gets its own card, so they can be told apart at a glance.",
                representation: .individualCards),
        ]
    )

    @MainActor private static let fullDeclaration = DesignExperiment(
        id: "inventory-container-full-declaration",
        question: "How, or whether, should \"full\" be expressed?",
        subject: detailSubject,
        variants: [
            detailVariant(
                "manual", "Manual declaration",
                note: "A yes/no a person sets. Current default.",
                full: .manual),
            detailVariant(
                "property", "Computed property",
                note:
                    "\"At capacity\" appears once the count crosses a threshold; nobody declares it.",
                full: .property),
            detailVariant(
                "absent", "Absent from initial UI",
                note: "Fullness is not shown at all yet; count and photos are the only signal.",
                full: .absent),
        ]
    )

    @MainActor private static let destinationField = DesignExperiment(
        id: "inventory-container-destination",
        question: "Is a destination a current field, a packing annotation, or a later move action?",
        subject: detailSubject,
        variants: [
            detailVariant(
                "current-field", "Current field",
                note: "\"Destination\" reads like any other placement field, always present.",
                destination: .currentField),
            detailVariant(
                "packing-annotation", "Packing annotation",
                note: "\"Heading to\" reads as a soft note beside the placement. Current default.",
                destination: .packingAnnotation),
            detailVariant(
                "later-move-action", "Later move action",
                note:
                    "No destination shows until Move is used; the detail states only where it is now.",
                destination: .laterMoveAction),
        ]
    )

    @MainActor
    private static func detailVariant(
        _ id: String,
        _ title: String,
        note: String,
        structure: InventoryContainerStyle.DetailStructure = .dedicatedWorkspace,
        full: InventoryContainerStyle.FullDeclaration = .manual,
        destination: InventoryContainerStyle.DestinationField = .packingAnnotation
    ) -> DesignVariant {
        let style = InventoryContainerStyle(
            detailStructure: structure, fullDeclaration: full, destinationField: destination)
        return DesignVariant(
            id: id, title: title, note: note,
            surface: InventoryContainerStaging.detailSurface(style: style))
    }

    @MainActor
    private static func openVariant(
        _ id: String,
        _ title: String,
        note: String,
        representation: InventoryContainerStyle.OpenRepresentation
    ) -> DesignVariant {
        let style = InventoryContainerStyle(openRepresentation: representation)
        return DesignVariant(
            id: id, title: title, note: note,
            surface: InventoryContainerStaging.openContainersSurface(style: style))
    }
}
