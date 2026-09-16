/// The five questions POPS-3989 leaves open. Joao decides these on the
/// device; nothing here does.
///
/// Each varies exactly one field of ``InventoryLifecycleStyle`` and holds the
/// others at their defaults, the same discipline
/// ``InventoryFoundationExperiments`` uses and for the same reason: a variant
/// that quietly took a position on a second question would answer it without
/// anyone deciding to.
internal enum InventoryLifecycleExperiments {
    @MainActor internal static let all: [DesignExperiment] = [
        reasonPresentation, discardConfirmation, quantityReduction, inactiveSearchVisibility,
        timelineDetail,
    ]

    private static let gallerySubject = SurfaceID(area: "inventory", slug: "lifecycle-gallery")
    private static let timelineSubject = SurfaceID(area: "inventory", slug: "history-timeline")

    @MainActor private static let reasonPresentation = DesignExperiment(
        id: "inventory-lifecycle-reason-presentation",
        question:
            "Is a discard's reason (donated, sold, used up…) its own state, or a fact "
            + "attached to one inactive state?",
        subject: gallerySubject,
        variants: [
            galleryVariant(
                "reason-chip", "A chip beside the badge",
                note: "Discarded stays the badge; the reason rides beside it. Holds the badge's "
                    + "wording fixed, which the reason-replaces-label variant does not.",
                style: .init(reasonPresentation: .reasonChip)),
            galleryVariant(
                "note-only", "In the note, nowhere else",
                note: "No structured reason at all, whatever was written stays in the free-text "
                    + "note, and the badge says only Discarded.",
                style: .init(reasonPresentation: .noteOnly)),
            galleryVariant(
                "replaces-label", "The reason is the badge",
                note: "\"Donated\" where the badge would otherwise say Discarded. Fewer words per "
                    + "row, at the cost of Discarded never appearing as such.",
                style: .init(reasonPresentation: .reasonReplacesLabel)),
        ]
    )

    @MainActor private static let discardConfirmation = DesignExperiment(
        id: "inventory-lifecycle-discard-confirmation",
        question: "Does a reversible removal act on the tap, or ask first?",
        subject: gallerySubject,
        variants: [
            galleryVariant(
                "immediate", "Immediately, nothing more",
                note: "Tap Discard and it is done. Matches how the foundation's Discard works "
                    + "today; the note already says it can be restored.",
                style: .init(discardConfirmation: .immediate),
                opening: "discard-single"),
            galleryVariant(
                "immediate-undo", "Immediately, with Undo",
                note: "Acts on the tap, and a banner offers one-tap Undo for a short window "
                    + "afterwards.",
                style: .init(discardConfirmation: .immediateWithUndo),
                opening: "discard-single"),
            galleryVariant(
                "confirm-first", "Asks first",
                note: "The same confirmation dialog Mark as destroyed uses, on an action the ADR "
                    + "says should not need one.",
                style: .init(discardConfirmation: .confirmFirst),
                opening: "discard-single"),
        ]
    )

    @MainActor private static let quantityReduction = DesignExperiment(
        id: "inventory-lifecycle-quantity-reduction",
        question:
            "When only some of a grouped record is discarded, does the record's own "
            + "quantity drop, or does the removed part become its own record?",
        subject: gallerySubject,
        variants: [
            galleryVariant(
                "decrement", "The record gets smaller",
                note: "120 screws, discard 20, one record now says 100. Simpler; the removed "
                    + "units carry no disposition of their own, only a timeline note.",
                style: .init(quantityReduction: .decrementInPlace), opening: "discard-group"),
            galleryVariant(
                "split-then-dispose", "The removed units become a record",
                note: "The same split the ADR already gives a group, except the new record opens "
                    + "already discarded, so the removed units get their own place in history.",
                style: .init(quantityReduction: .splitThenDispose), opening: "discard-group"),
        ]
    )

    @MainActor private static let inactiveSearchVisibility = DesignExperiment(
        id: "inventory-lifecycle-search-visibility",
        question: "Does an ordinary search turn up discarded, retired and lost items?",
        subject: gallerySubject,
        variants: [
            galleryVariant(
                "hidden", "Hidden until asked for",
                note: "An ordinary search matches active items only; the Inactive chip is the "
                    + "only way to see the rest.",
                style: .init(inactiveSearchVisibility: .hiddenByDefault)),
            galleryVariant(
                "bottom", "Shown, sorted last",
                note: "Every match appears, but active results always come first.",
                style: .init(inactiveSearchVisibility: .shownAtBottom)),
            galleryVariant(
                "inline", "Shown wherever it ranks",
                note: "No second-class treatment; a badge is the only thing marking it inactive.",
                style: .init(inactiveSearchVisibility: .shownInline)),
        ]
    )

    @MainActor private static let timelineDetail = DesignExperiment(
        id: "inventory-lifecycle-timeline-detail",
        question: "Does the movement/lifecycle timeline say everything up front, or on request?",
        subject: timelineSubject,
        variants: [
            timelineVariant(
                "compact", "One line each",
                note: "The same row the foundation's activity list already uses. Faster to scan; "
                    + "a reason or note beyond one line is lost.",
                style: .init(timelineDetail: .compact)),
            timelineVariant(
                "drill-in", "One line, then the full account",
                note: "Tapping an event opens what the compact row could not fit.",
                style: .init(timelineDetail: .drillIn), opening: "event-detail"),
        ]
    )

    @MainActor
    private static func galleryVariant(
        _ id: String,
        _ title: String,
        note: String,
        style: InventoryLifecycleStyle,
        opening: String = "default"
    ) -> DesignVariant {
        DesignVariant(
            id: id, title: title, note: note,
            surface: InventoryLifecycleStaging.gallery(style: style, opening: opening))
    }

    @MainActor
    private static func timelineVariant(
        _ id: String,
        _ title: String,
        note: String,
        style: InventoryLifecycleStyle,
        opening: String = "default"
    ) -> DesignVariant {
        DesignVariant(
            id: id, title: title, note: note,
            surface: InventoryLifecycleStaging.timeline(style: style, opening: opening))
    }
}
