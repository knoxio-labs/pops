/// The five questions POPS-3989 raised about lifecycle and history, all
/// settled. Only the winning variants stay: a losing screen kept alive is a
/// second answer somebody will build from.
internal enum InventoryLifecycleExperiments {
    @MainActor internal static let all: [DesignExperiment] = [
        reasonPresentation, discardConfirmation, quantityReduction, inactiveSearchVisibility,
        timelineDetail,
    ]

    private static let decidedOn = "Decided by Joao, 2026-09-17: "

    @MainActor private static let reasonPresentation = DesignExperiment(
        id: "inventory-lifecycle-reason-presentation",
        question:
            "Is a discard's reason (donated, sold, used up) its own state, or a fact "
            + "attached to one inactive state?",
        subject: InventoryLifecycleSurfaces.lifecycleID,
        status: .decided(
            variant: "on-the-event",
            rationale: decidedOn
                + "the badge is the lifecycle word, Retired, Discarded, Lost or Destroyed. A "
                + "reason is recorded on the history event and nowhere else."),
        variants: [
            DesignVariant(
                id: "on-the-event", title: "On the history event",
                note: "The notice and the history line carry it; the badge never does.",
                surface: InventoryLifecycleSurfaces.lifecycle)
        ]
    )

    @MainActor private static let discardConfirmation = DesignExperiment(
        id: "inventory-lifecycle-discard-confirmation",
        question: "Does a reversible removal act on the tap, or ask first?",
        subject: InventoryLifecycleSurfaces.lifecycleID,
        status: .decided(
            variant: "immediate-undo",
            rationale: decidedOn
                + "a reversible removal acts at once and leaves the undo capsule. Only Destroy "
                + "confirms, in a red native dialog saying history and documents stay."),
        variants: [
            DesignVariant(
                id: "immediate-undo", title: "Immediately, with Undo",
                note: "Discard, Mark lost, Retire and Restore all leave the capsule.",
                surface: InventoryLifecycleSurfaces.lifecycle)
        ]
    )

    @MainActor private static let quantityReduction = DesignExperiment(
        id: "inventory-lifecycle-quantity-reduction",
        question:
            "When only some of a grouped record is discarded, does the record's own "
            + "quantity drop, or does the removed part become its own record?",
        subject: InventoryLifecycleSurfaces.lifecycleID,
        status: .decided(
            variant: "whole-split-or-renumber",
            rationale: decidedOn
                + "there is no partial discard. A group is discarded whole, split, or "
                + "renumbered, from Discard all, Split and Change quantity in the More menu."),
        variants: [
            DesignVariant(
                id: "whole-split-or-renumber", title: "Whole, split, or renumbered",
                note: "Split and Change quantity are small sheets committing from the bar.",
                surface: InventoryLifecycleSurfaces.lifecycle)
        ]
    )

    @MainActor private static let inactiveSearchVisibility = DesignExperiment(
        id: "inventory-lifecycle-search-visibility",
        question: "Does an ordinary search turn up discarded, retired and lost items?",
        subject: UniversalSearchSurfaces.rootID,
        status: .decided(
            variant: "hidden",
            rationale: decidedOn
                + "only with Include inactive on in the filter sheet, in Search and Items "
                + "alike, and marked by the lifecycle badge."),
        variants: [
            DesignVariant(
                id: "hidden", title: "Hidden until asked for",
                note: "The filter sheet's Include inactive is the way in.",
                surface: UniversalSearchSurfaces.root)
        ]
    )

    @MainActor private static let timelineDetail = DesignExperiment(
        id: "inventory-lifecycle-timeline-detail",
        question: "Does the movement/lifecycle timeline say everything up front, or on request?",
        subject: InventoryLifecycleSurfaces.historyID,
        status: .decided(
            variant: "drill-in",
            rationale: decidedOn
                + "one line per event, glyph, what happened and when. A tap opens the full "
                + "account as a sheet, with Undo while it is recent."),
        variants: [
            DesignVariant(
                id: "drill-in", title: "One line, then the full account",
                note: "From, to, reason and device live in the sheet.",
                surface: InventoryLifecycleSurfaces.history)
        ]
    )
}
