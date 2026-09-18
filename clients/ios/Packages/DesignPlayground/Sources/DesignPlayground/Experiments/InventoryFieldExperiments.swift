/// POPS-4015's four questions about a type's field values, all settled on the
/// device.
///
/// The answers live inside New item, so each is staged on its typed state,
/// where a type's fields, their choices and their units are filled in.
internal enum InventoryFieldExperiments {
    @MainActor internal static let all: [DesignExperiment] = [
        choicePresentation, unitPresentation, driftTreatment, validationOutcome,
    ]

    private static let decidedOn = "Decided by Joao on the device, 2026-09-18: "

    @MainActor private static let choicePresentation = DesignExperiment(
        id: "inventory-field-choice-presentation",
        question: "How should a long choice list be offered while it is being filled in?",
        subject: InventoryCreationSurfaces.createID,
        status: .decided(
            variant: "sheet-list",
            rationale: decidedOn
                + "a choice field opens a list, searchable when the list is long."),
        variants: [
            variant(
                "sheet-list", "Opens a list",
                note: "A plain row that opens the full list, with a search field when it is long.")
        ]
    )

    @MainActor private static let unitPresentation = DesignExperiment(
        id: "inventory-field-unit-presentation",
        question: "What does a field's unit look like on entry and in search?",
        subject: InventoryCreationSurfaces.createID,
        status: .decided(
            variant: "segmented-control",
            rationale: decidedOn
                + "the unit is a picker beside the value, and each value keeps its unit."),
        variants: [
            variant(
                "segmented-control", "Unit picker beside the value",
                note:
                    "The number and its unit are two controls; a value keeps the unit it was entered in."
            )
        ]
    )

    @MainActor private static let driftTreatment = DesignExperiment(
        id: "inventory-field-drift-treatment",
        question:
            "What does the phone show when a deploy narrows a field under items already on it?",
        subject: InventoryCreationSurfaces.createID,
        status: .decided(
            variant: "migration",
            rationale: decidedOn
                + "a deploy that changes a field is a migration, with no UI. The phone never holds "
                + "a value its type no longer declares."),
        variants: [
            variant(
                "migration", "A migration, no screen",
                note: "Nothing to show: the data is migrated with the deploy.")
        ]
    )

    @MainActor private static let validationOutcome = DesignExperiment(
        id: "inventory-field-validation-outcome",
        question: "Does a value outside a field's list block the save, or park the item?",
        subject: InventoryCreationSurfaces.createID,
        status: .decided(
            variant: "not-a-state",
            rationale: decidedOn
                + "a value outside the list is not a state. A choice is picked from the type's "
                + "list, so there is nothing to block and nothing to park."),
        variants: [
            variant(
                "not-a-state", "Cannot happen",
                note: "Values are picked from the list, never typed free.")
        ]
    )

    @MainActor
    private static func variant(_ id: String, _ title: String, note: String) -> DesignVariant {
        DesignVariant(
            id: id, title: title, note: note,
            surface: InventoryCreationSurfaces.create(opening: "typed"))
    }
}
