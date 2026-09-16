/// The five questions POPS-3979 leaves open, all live on one surface.
///
/// Each varies exactly one field of ``InventoryFoundationStyle`` and holds the
/// others at their defaults. Where a held default changes how a question reads,
/// the variant's note says so, that is the price of several experiments
/// sharing a surface, and it is paid here rather than left for a reviewer to
/// notice. ADR-001 lists these as open; deciding one updates the ADR.
internal enum InventoryFoundationExperiments {
    @MainActor internal static let all: [DesignExperiment] = [
        containerMark, stateTreatment, syncVisibility, inHandTerm, closeActions,
    ]

    private static let subject = SurfaceID(area: "inventory", slug: "foundations")

    @MainActor private static let containerMark = DesignExperiment(
        id: "inventory-container-mark",
        question: "Should a container look different from an item, while still being one?",
        subject: subject,
        status: .decided(
            variant: "squared",
            rationale:
                "Squared, in Inventory's own amber, decided on the device 2026-09-16. A different shape "
                + "says container at a glance without a second colour, and the tint carries the "
                + "pillar's identity onto every list."),
        variants: [
            variant(
                "like-an-item", "Like an item",
                note:
                    "Same mark as everything else; only the glyph differs. Holds state as badges, so "
                    + "the Open/Closed chip is doing the distinguishing here, judge the row without it.",
                style: .init(containerMark: .likeAnItem)),
            variant(
                "tinted", "Tinted",
                note:
                    "Accent-tinted mark, the same treatment the dashboard gives Browse. Current default.",
                style: .init(containerMark: .tinted)),
            variant(
                "squared", "Squared",
                note:
                    "A rounded square instead of a circle, so a container reads as a different shape at a glance.",
                style: .init(containerMark: .squared)),
        ]
    )

    @MainActor private static let stateTreatment = DesignExperiment(
        id: "inventory-state-treatment",
        question: "How should an item's state reach the reader: a badge, words, an icon, or both?",
        subject: subject,
        status: .decided(
            variant: "badge",
            rationale:
                "Badge, decided on the device 2026-09-16. A chip is read without being decoded, and "
                + "it keeps the detail line for the type and the placement."),
        variants: [
            variant(
                "badge", "Badge",
                note: "A chip per state, below the detail line. Current default.",
                style: .init(stateTreatment: .badge)),
            variant(
                "subtitle", "In the subtitle",
                note:
                    "The state is a word at the end of the detail line. Costs no height; costs line length.",
                style: .init(stateTreatment: .subtitle)),
            variant(
                "icon", "Icon",
                note: "A glyph beside the name. Compact, and relies on the glyph being learned.",
                style: .init(stateTreatment: .icon)),
            variant(
                "combined", "Icon and words",
                note:
                    "The glyph beside the name and the word in the subtitle. Most explicit, most repetitive.",
                style: .init(stateTreatment: .combined)),
        ]
    )

    @MainActor private static let syncVisibility = DesignExperiment(
        id: "inventory-sync-visibility",
        question: "How much sync state should show while nothing is wrong?",
        subject: subject,
        status: .decided(
            variant: "work-in-flight",
            rationale:
                "Work in flight and problems, decided on the device 2026-09-16. A change that has not "
                + "left the phone is worth a quiet mark; a synced one is not worth anything."),
        variants: [
            variant(
                "problems-only", "Only problems",
                note: "Stale and failed changes show; queued and syncing do not. Current default.",
                style: .init(syncVisibility: .fromVisible)),
            variant(
                "work-in-flight", "Work in flight too",
                note:
                    "Queued and syncing rows carry a quiet cloud. Honest about what has not left the phone.",
                style: .init(syncVisibility: .fromQuiet)),
            variant(
                "everything", "Everything",
                note:
                    "Every row carries its sync state, including synced. The ceiling, for comparison.",
                style: .init(syncVisibility: .everything)),
        ]
    )

    @MainActor private static let inHandTerm = DesignExperiment(
        id: "inventory-in-hand-term",
        question: "What should an item that has been picked up and not put anywhere be called?",
        subject: subject,
        status: .decided(
            variant: "in-hand",
            rationale:
                "In hand, decided on the device 2026-09-16. It says what is physically true."),
        variants: [
            variant(
                "in-hand", "In hand",
                note: "Says what is physically true. Current default.",
                style: .init(inHandTerm: .inHand)),
            variant(
                "unplaced", "Unplaced",
                note:
                    "Says what the catalogue knows, no placement. Also covers things set down and forgotten.",
                style: .init(inHandTerm: .unplaced)),
            variant(
                "picked-up", "Picked up",
                note:
                    "Names the action that caused it, so the way back, Put back, reads as its pair.",
                style: .init(inHandTerm: .pickedUp)),
        ]
    )

    @MainActor private static let closeActions = DesignExperiment(
        id: "inventory-close-seal",
        question: "Is sealing a box a separate action from closing it?",
        subject: subject,
        status: .decided(
            variant: "close-only",
            rationale:
                "Close only, decided on the device 2026-09-16. A closed box is a closed box. A second "
                + "verb whose whole difference is a confirmation on reopening is a step added to "
                + "unpacking day, paid on every box, for a promise a sticker keeps better."),
        variants: [
            variant(
                "close-only", "Close only",
                note: "One action. A closed box is a closed box. Current default.",
                style: .init(closeActions: .closeOnly), opening: "container-actions"),
            variant(
                "close-and-seal", "Close and seal",
                note:
                    "Seal sits beside Close, and a sealed box's one action asks before it acts. "
                    + "Tap Break the seal.",
                style: .init(closeActions: .closeAndSeal), opening: "container-actions"),
        ]
    )

    @MainActor
    private static func variant(
        _ id: String,
        _ title: String,
        note: String,
        style: InventoryFoundationStyle,
        opening: String = "default"
    ) -> DesignVariant {
        DesignVariant(
            id: id, title: title, note: note,
            surface: InventoryFoundationStaging.surface(style: style, opening: opening))
    }
}
