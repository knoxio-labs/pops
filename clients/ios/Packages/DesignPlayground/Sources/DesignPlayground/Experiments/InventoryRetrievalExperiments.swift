/// The four questions POPS-3987 raised about retrieval and unpacking, all
/// settled. Only the winning variants stay: a losing screen kept alive is a
/// second answer somebody will build from.
internal enum InventoryRetrievalExperiments {
    @MainActor internal static let all: [DesignExperiment] = [
        pickupGrammar, confirmationLevel, unpackingSelection, unpackingStructure,
    ]

    private static let decidedOn = "Decided by Joao, 2026-09-17: "

    @MainActor private static let pickupGrammar = DesignExperiment(
        id: "inventory-pickup-grammar",
        question:
            "Should taking something be an explicit pick-up before a destination is chosen, "
            + "or can a move go straight there?",
        subject: InventoryRetrievalSurfaces.inHandID,
        status: .decided(
            variant: "both",
            rationale: decidedOn
                + "both exist. Pick up lands the item in hand and remembers where it was; Move "
                + "goes straight to a destination through the one placement picker."),
        variants: [
            DesignVariant(
                id: "both", title: "Pick up and Move",
                note: "Put back is one tap whenever the previous place still exists.",
                surface: InventoryRetrievalSurfaces.inHand)
        ]
    )

    @MainActor private static let confirmationLevel = DesignExperiment(
        id: "inventory-retrieval-confirmation",
        question:
            "How much should retrieval stop to ask, given that pick up, put back and move are "
            + "all undoable?",
        subject: InventoryRetrievalSurfaces.inHandID,
        status: .decided(
            variant: "rely-on-undo",
            rationale: decidedOn
                + "nothing asks first. Each action leaves an undo capsule, and Recent work "
                + "keeps it after the capsule goes."),
        variants: [
            DesignVariant(
                id: "rely-on-undo", title: "Rely on undo",
                note: "The capsule after Put back, Move and Put all back.",
                surface: InventoryRetrievalSurfaces.inHand)
        ]
    )

    @MainActor private static let unpackingSelection = DesignExperiment(
        id: "inventory-unpacking-selection",
        question:
            "Should unpacking move items out one at a time, or with a lightweight selection that "
            + "sends several together?",
        subject: InventoryContainerSurfaces.pageID,
        status: .decided(
            variant: "select-mode",
            rationale: decidedOn
                + "one at a time by swipe, and a Select mode on the container's contents for "
                + "several, with Pick up and Move in the bottom bar."),
        variants: [
            DesignVariant(
                id: "select-mode", title: "Select mode",
                note: "Ticks on the contents rows; the bottom bar carries the count.",
                surface: InventoryContainerSurfaces.page)
        ]
    )

    @MainActor private static let unpackingStructure = DesignExperiment(
        id: "inventory-unpacking-structure",
        question:
            "Does unpacking need a named workspace of its own, or is it the container's ordinary "
            + "actions?",
        subject: InventoryContainerSurfaces.pageID,
        status: .decided(
            variant: "ordinary-actions",
            rationale: decidedOn
                + "there is no workspace. Unpacking is the container page's own actions, closing "
                + "a part-unpacked box asks nothing, and an emptied box offers Keep or Retire."),
        variants: [
            DesignVariant(
                id: "ordinary-actions", title: "The container page",
                note: "The approved page, its contents emptied row by row.",
                surface: InventoryContainerSurfaces.page)
        ]
    )
}
