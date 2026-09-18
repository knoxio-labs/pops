/// The five questions POPS-3979 asked about every Inventory row, badge and
/// action, all settled on the device.
///
/// The gallery they were asked on is gone; each answer is now staged on the
/// approved screen where it is most visible, and ``InventoryFoundationStyle``'s
/// defaults are the decisions.
internal enum InventoryFoundationExperiments {
    @MainActor internal static let all: [DesignExperiment] = [
        containerMark, stateTreatment, syncVisibility, inHandTerm, closeActions,
    ]

    private static let decidedOn = "Decided by Joao on the device, 2026-09-16: "

    @MainActor private static let containerMark = DesignExperiment(
        id: "inventory-container-mark",
        question: "Should a container look different from an item, while still being one?",
        subject: InventoryContainerSurfaces.browser.id,
        status: .decided(
            variant: "squared",
            rationale: decidedOn
                + "squared, in Inventory's own amber. A different shape says container at a glance "
                + "without a second colour, and the tint carries the pillar's identity onto every list."
        ),
        variants: [
            DesignVariant(
                id: "squared", title: "Squared",
                note:
                    "A rounded square instead of a circle, so a container reads as a different shape at a glance.",
                surface: InventoryContainerSurfaces.browser)
        ]
    )

    @MainActor private static let stateTreatment = DesignExperiment(
        id: "inventory-state-treatment",
        question: "How should an item's state reach the reader: a badge, words, an icon, or both?",
        subject: InventorySearchSurfaces.items.id,
        status: .decided(
            variant: "badge",
            rationale: decidedOn
                + "state as a badge. A chip is read without being decoded, and it keeps the detail "
                + "line for the type and the placement."),
        variants: [
            DesignVariant(
                id: "badge", title: "Badge",
                note: "A chip per state, below the detail line.",
                surface: InventorySearchSurfaces.items)
        ]
    )

    @MainActor private static let syncVisibility = DesignExperiment(
        id: "inventory-sync-visibility",
        question: "How much sync state should show while nothing is wrong?",
        subject: InventorySyncSurfaces.offlineID,
        status: .decided(
            variant: "work-in-flight",
            rationale: decidedOn
                + "sync shows work in flight and problems. A change that has not left the phone is "
                + "worth a quiet mark; a synced one is not worth anything."),
        variants: [
            DesignVariant(
                id: "work-in-flight", title: "Work in flight too",
                note:
                    "Queued and syncing rows carry a quiet cloud. Honest about what has not left the phone.",
                surface: InventorySyncSurfaces.offlineSurface(opening: "items"))
        ]
    )

    @MainActor private static let inHandTerm = DesignExperiment(
        id: "inventory-in-hand-term",
        question: "What should an item that has been picked up and not put anywhere be called?",
        subject: InventoryRetrievalSurfaces.inHandID,
        status: .decided(
            variant: "in-hand",
            rationale: decidedOn + "\"in hand\". It says what is physically true."),
        variants: [
            DesignVariant(
                id: "in-hand", title: "In hand",
                note: "Says what is physically true.",
                surface: InventoryRetrievalSurfaces.inHand)
        ]
    )

    @MainActor private static let closeActions = DesignExperiment(
        id: "inventory-close-seal",
        question: "Is sealing a box a separate action from closing it?",
        subject: InventoryContainerSurfaces.pageID,
        status: .decided(
            variant: "close-only",
            rationale: decidedOn
                + "close only. A closed box is a closed box. A second verb whose whole difference is "
                + "a confirmation on reopening is a step added to unpacking day, paid on every box, "
                + "for a promise a sticker keeps better."),
        variants: [
            DesignVariant(
                id: "close-only", title: "Close only",
                note: "One action. A closed box is a closed box.",
                surface: InventoryContainerSurfaces.page)
        ]
    )
}
