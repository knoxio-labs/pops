/// The five questions POPS-3988 raised about sync and repair, all settled.
/// Only the winning variants stay: a losing screen kept alive is a second
/// answer somebody will build from.
internal enum InventorySyncExperiments {
    @MainActor internal static let all: [DesignExperiment] = [
        globalStatus, repairPlacement, conflictTreatment, interruption, staleDisclosure,
    ]

    private static let decidedOn = "Decided by Joao, 2026-09-17: "

    @MainActor private static let globalStatus = DesignExperiment(
        id: "inventory-sync-global-status",
        question: "Where should sync state reach someone who is not on the dashboard?",
        subject: InventorySyncSurfaces.offlineID,
        status: .decided(
            variant: "shell-banner",
            rationale: decidedOn
                + "sync state is app-wide. The shell's degradation banner says stale or failed, "
                + "each row carries its own queued mark, and Inventory adds no capsule."),
        variants: [
            DesignVariant(
                id: "shell-banner", title: "The app's banner and each row's mark",
                note: "The same banner every feature sits under; nothing of Inventory's own.",
                surface: InventorySyncSurfaces.offlineSurface(opening: "dashboard"))
        ]
    )

    @MainActor private static let repairPlacement = DesignExperiment(
        id: "inventory-sync-repair-placement",
        question: "Should a repair be offered where the item is, or only where repairs are kept?",
        subject: InventorySyncSurfaces.syncID,
        status: .decided(
            variant: "both",
            rationale: decidedOn
                + "a repair is offered inline on the row it belongs to and collected under "
                + "Sync and repair, each row with its one fix."),
        variants: [
            DesignVariant(
                id: "both", title: "On its row, and collected",
                note: "The fix is an amber icon on the row; a tap on the row opens the repair.",
                surface: InventorySyncSurfaces.sync)
        ]
    )

    @MainActor private static let conflictTreatment = DesignExperiment(
        id: "inventory-sync-conflict-treatment",
        question: "How should two values that cannot both be true be put to a person?",
        subject: InventorySyncSurfaces.repairID,
        status: .decided(
            variant: "stacked",
            rationale: decidedOn
                + "stacked, one value above the other, each labelled by source and time; pick "
                + "one, then Keep or Discard mine, with Undo after."),
        variants: [
            DesignVariant(
                id: "stacked", title: "One above the other",
                note: "Each side is a selectable row: This phone, iPad or Server.",
                surface: InventorySyncSurfaces.repair)
        ]
    )

    @MainActor private static let interruption = DesignExperiment(
        id: "inventory-sync-interruption",
        question: "What earns the right to interrupt somebody mid-task?",
        subject: InventorySyncSurfaces.interruptionsID,
        status: .decided(
            variant: "queue-stopping",
            rationale: decidedOn
                + "only what stops everything: an expired session, full storage, an app too "
                + "old, as a system alert or a blocking sheet. Everything else waits to be found."),
        variants: [
            DesignVariant(
                id: "queue-stopping", title: "Only what stops everything",
                note: "One line and one action each.",
                surface: InventorySyncSurfaces.interruptions)
        ]
    )

    @MainActor private static let staleDisclosure = DesignExperiment(
        id: "inventory-sync-stale-disclosure",
        question: "How should the age of an answer be disclosed while searching or scanning?",
        subject: InventorySyncSurfaces.offlineID,
        status: .decided(
            variant: "glyph-only",
            rationale: decidedOn + "the row's own stale mark, and nothing else."),
        variants: [
            DesignVariant(
                id: "glyph-only", title: "The row's own stale mark",
                note: "No age in words and no banner over the results.",
                surface: InventorySyncSurfaces.offlineSurface(opening: "search"))
        ]
    )
}
