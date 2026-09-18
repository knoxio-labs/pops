/// The three questions POPS-3984 left for the device, all three settled on it.
///
/// The record of what was chosen stays here, and the losing variants do not:
/// each of them staged a whole screen, and a screen kept alive to lose an
/// argument that is over is a second answer somebody will build from.
internal enum InventoryCreationExperiments {
    @MainActor internal static let all: [DesignExperiment] = [structure, codeAssist, moment]

    private static let decidedOn =
        "Decided by Joao on the device, 2026-09-17: "

    @MainActor private static let structure = DesignExperiment(
        id: "inventory-create-structure",
        question: "What shape does recording an item have on a phone?",
        subject: InventoryCreationSurfaces.createID,
        status: .decided(
            variant: "photo-led",
            rationale: decidedOn
                + "photographs first, then the form. The one ask that has to happen while the "
                + "object is still in your hands goes first; steps and sheets both put the "
                + "optional half behind a tap, and a thing behind a tap on a phone is a thing "
                + "that does not get done."),
        variants: [
            DesignVariant(
                id: "photo-led", title: "Photo first, then the form",
                note:
                    "Every field on one screen, with the photo strip above the name. Creates at "
                    + "the final action.",
                surface: InventoryCreationSurfaces.create)
        ]
    )

    @MainActor private static let codeAssist = DesignExperiment(
        id: "inventory-code-assist-placement",
        question: "Where does the code suggestion live: in the field, or behind it?",
        subject: InventoryCreationSurfaces.createID,
        status: .decided(
            variant: "inline",
            rationale: decidedOn
                + "in the field. A code is optional, and a sheet for an optional value turns an "
                + "offer into a step. Suggest sits beside the field and every outcome, pending, "
                + "accepted, edited, taken, lands under it."),
        variants: [
            DesignVariant(
                id: "inline", title: "In the field",
                note: "Suggest beside the code field; the outcome is a note under it.",
                surface: InventoryCreationSurfaces.create)
        ]
    )

    @MainActor private static let moment = DesignExperiment(
        id: "inventory-create-moment",
        question: "When does the record start existing?",
        subject: InventoryCreationSurfaces.createID,
        status: .decided(
            variant: "final-action",
            rationale: decidedOn
                + "at the final action. Everything above the bar is held on this phone, which is "
                + "what lets Cancel mean cancel; a record that exists from the first keystroke "
                + "leaves no way to change your mind that is not a discard."),
        variants: [
            DesignVariant(
                id: "final-action", title: "At the final action",
                note: "Nothing exists until Create. Cancel asks whenever there is work staged.",
                surface: InventoryCreationSurfaces.create)
        ]
    )
}
