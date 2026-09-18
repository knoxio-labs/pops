/// The four questions POPS-3986 raised, all settled on the device. Only the
/// winning variants stay: a losing screen kept alive is a second answer
/// somebody will build from.
internal enum InventoryContainerExperiments {
    @MainActor internal static let all: [DesignExperiment] = [
        detailStructure, openRepresentation, fullDeclaration, destinationField,
    ]

    private static let decidedOn = "Decided by Joao on the device, 2026-09-16: "

    @MainActor private static let detailStructure = DesignExperiment(
        id: "inventory-container-detail-structure",
        question:
            "Is a container's workspace a section inside its item detail, or a screen detail links to?",
        subject: InventoryContainerSurfaces.pageID,
        status: .decided(
            variant: "unified-section",
            rationale: decidedOn
                + "a container's page is the item page with its verbs in the action row and a "
                + "Contents section below. There is no separate workspace."),
        variants: [
            DesignVariant(
                id: "unified-section", title: "Unified section",
                note: "Contents, search and the full switch sit in the item page's own scroll.",
                surface: InventoryContainerSurfaces.page)
        ]
    )

    @MainActor private static let openRepresentation = DesignExperiment(
        id: "inventory-open-containers-representation",
        question: "How should several simultaneous open containers be shown together?",
        subject: InventoryContainerSurfaces.openID,
        status: .decided(
            variant: "grouped-card",
            rationale: decidedOn
                + "exactly the dashboard's open-containers panel, one card with a row each, "
                + "swipe to close."),
        variants: [
            DesignVariant(
                id: "grouped-card", title: "The dashboard's panel",
                note: "Every open container in one amber-edged card.",
                surface: InventoryContainerSurfaces.openContainers)
        ]
    )

    @MainActor private static let fullDeclaration = DesignExperiment(
        id: "inventory-container-full-declaration",
        question: "How, or whether, should \"full\" be expressed?",
        subject: InventoryContainerSurfaces.pageID,
        status: .decided(
            variant: "manual",
            rationale: decidedOn + "full is a manual yes/no a person sets."),
        variants: [
            DesignVariant(
                id: "manual", title: "Manual yes/no",
                note: "A switch at the top of Contents.",
                surface: InventoryContainerSurfaces.page)
        ]
    )

    @MainActor private static let destinationField = DesignExperiment(
        id: "inventory-container-destination",
        question: "Is a destination a current field, a packing annotation, or a later move action?",
        subject: InventoryContainerSurfaces.pageID,
        status: .decided(
            variant: "later-move-action",
            rationale: decidedOn
                + "destination is not a field. A box headed somewhere says so in its name, and "
                + "getting there is a move like any other."),
        variants: [
            DesignVariant(
                id: "later-move-action", title: "A move, not a field",
                note: "The page states only where the container is now.",
                surface: InventoryContainerSurfaces.page)
        ]
    )
}
