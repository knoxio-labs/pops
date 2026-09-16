/// The four questions POPS-3987 opens about retrieval and unpacking.
///
/// Joao decides these on the device, not here: every one of them stays
/// `.open`. Two are about retrieval and vary ``InventoryRetrievalStyle``; two
/// are about unpacking and vary ``InventoryUnpackingStyle``. Each holds the
/// other field of its style at the default, the same discipline
/// ``InventoryFoundationExperiments`` uses so several open questions can share
/// one surface honestly.
internal enum InventoryRetrievalExperiments {
    @MainActor internal static let all: [DesignExperiment] = [
        pickupGrammar, confirmationLevel, unpackingSelection, unpackingStructure,
    ]

    private static let retrievalSubject = SurfaceID(area: "inventory", slug: "in-hand")
    private static let unpackingSubject = SurfaceID(area: "inventory", slug: "unpacking")

    @MainActor private static let pickupGrammar = DesignExperiment(
        id: "inventory-pickup-grammar",
        question:
            "Should taking something be an explicit pick-up before a destination is chosen, "
            + "or can a move go straight there with in-hand as something that happens along the way?",
        subject: retrievalSubject,
        variants: [
            retrievalVariant(
                "pickup-then-destination", "Pick up, then destination",
                note:
                    "Pick up is its own step, and always lands in hand first. What this playground's "
                    + "item actions already offer.",
                style: .init(pickupGrammar: .explicitPickUp)),
            retrievalVariant(
                "direct-move", "Direct move",
                note:
                    "Move goes straight from wherever the item is to a chosen destination. In hand "
                    + "still exists, for when no destination is chosen yet, but is not the only way "
                    + "through.",
                style: .init(pickupGrammar: .directMove)),
        ]
    )

    @MainActor private static let confirmationLevel = DesignExperiment(
        id: "inventory-retrieval-confirmation",
        question:
            "How much should retrieval stop to ask, given that pick up, put back and move are "
            + "all reversible or undoable?",
        subject: retrievalSubject,
        variants: [
            retrievalVariant(
                "rely-on-undo", "Rely on undo",
                note:
                    "Nothing asks first. A mistake is fixed with Undo, not prevented with a dialog.",
                style: .init(confirmationLevel: .relyOnUndo)),
            retrievalVariant(
                "confirm-pick-up", "Confirm pick-up only",
                note:
                    "Only picking something up asks, because it is the step that turns \"where is "
                    + "this\" into \"who is holding it\". Put back and move do not.",
                style: .init(confirmationLevel: .confirmPickUp), opening: "pick-up-confirmation"),
            retrievalVariant(
                "confirm-every", "Confirm every step",
                note: "Pick up, put back and move each ask first. Most cautious, most taps.",
                style: .init(confirmationLevel: .confirmEvery), opening: "pick-up-confirmation"),
        ]
    )

    @MainActor private static let unpackingSelection = DesignExperiment(
        id: "inventory-unpacking-selection",
        question:
            "Should unpacking move items out one at a time, or with a lightweight selection that "
            + "sends several to one destination together?",
        subject: unpackingSubject,
        variants: [
            unpackingVariant(
                "single-item", "Single-item actions",
                note: "Each row carries its own Move to… and Keep in hand. No selection state.",
                style: .init(selection: .singleItem)),
            unpackingVariant(
                "multi-select", "Lightweight multi-select",
                note:
                    "A checkbox per row and a bar that sends the selection to one destination "
                    + "together. Faster for a crate of identical fixtures; a poor fit for "
                    + "one-of-a-kind items headed to different rooms.",
                style: .init(selection: .lightweightMultiSelect)),
        ]
    )

    @MainActor private static let unpackingStructure = DesignExperiment(
        id: "inventory-unpacking-structure",
        question:
            "Does unpacking need a named workspace of its own, or is it the container's ordinary "
            + "actions, opened once per item?",
        subject: unpackingSubject,
        variants: [
            unpackingVariant(
                "named-workspace", "A named workspace",
                note:
                    "Its own screen: destination and contents together, progress toward empty, and "
                    + "the empty-container choice at the end.",
                style: .init(structure: .namedWorkspace)),
            unpackingVariant(
                "ordinary-actions", "Ordinary container actions",
                note:
                    "No dedicated screen. Each item is picked up from the same action sheet any "
                    + "open container offers, one at a time, with no sense of progress through the box.",
                style: .init(structure: .ordinaryContainerActions)),
        ]
    )

    @MainActor
    private static func retrievalVariant(
        _ id: String,
        _ title: String,
        note: String,
        style: InventoryRetrievalStyle,
        opening: String = "many"
    ) -> DesignVariant {
        DesignVariant(
            id: id, title: title, note: note,
            surface: InventoryRetrievalStaging.surface(style: style, opening: opening))
    }

    @MainActor
    private static func unpackingVariant(
        _ id: String,
        _ title: String,
        note: String,
        style: InventoryUnpackingStyle
    ) -> DesignVariant {
        DesignVariant(
            id: id, title: title, note: note,
            surface: InventoryUnpackingStaging.surface(style: style))
    }
}
