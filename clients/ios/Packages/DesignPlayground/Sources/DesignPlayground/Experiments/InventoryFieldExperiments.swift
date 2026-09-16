/// POPS-4015's four remaining questions, all live on one surface.
///
/// The source of a field's values and its unit was decided already: a type's
/// code definition, not a screen. What is open is presentation, and each
/// experiment here varies exactly one of ``InventoryFieldStyle``'s knobs.
internal enum InventoryFieldExperiments {
    @MainActor internal static let all: [DesignExperiment] = [
        choicePresentation, unitPresentation, driftTreatment, validationOutcome,
    ]

    private static let subject = SurfaceID(area: "inventory", slug: "field-values")

    @MainActor private static let choicePresentation = DesignExperiment(
        id: "inventory-field-choice-presentation",
        question: "How should a long choice list be offered while it is being filled in?",
        subject: subject,
        variants: [
            variant(
                "inline-chips", "Inline chips",
                note:
                    "All twelve wrap below the field. Nothing to open, and twelve is a lot of tapping targets.",
                style: .init(choicePresentation: .inlineChips), opening: "choice"),
            variant(
                "sheet-list", "Opens a list",
                note:
                    "A plain row that opens the full list. One tap further from the value it shows.",
                style: .init(choicePresentation: .sheetList), opening: "choice"),
            variant(
                "searchable-list", "Searchable list",
                note:
                    "The list from a typed prefix. Fastest once the value is known, worst for browsing.",
                style: .init(choicePresentation: .searchableList), opening: "choice"),
        ]
    )

    @MainActor private static let unitPresentation = DesignExperiment(
        id: "inventory-field-unit-presentation",
        question: "What does a field's unit look like on entry and in search?",
        subject: subject,
        variants: [
            variant(
                "suffix-in-field", "Suffix in the value",
                note:
                    "\"1.9 cm\" is one string. Reads naturally, and a typed value has to carry its own unit.",
                style: .init(unitPresentation: .suffixInField), opening: "unit"),
            variant(
                "segmented-control", "Separate unit control",
                note:
                    "The number and the unit are two controls. More to build, clearer that the unit can change.",
                style: .init(unitPresentation: .segmentedControl), opening: "unit"),
            variant(
                "label-only", "Named in the label",
                note:
                    "\"Width (cm)\" carries the unit; the value is a bare number. Shortest value column.",
                style: .init(unitPresentation: .labelOnly), opening: "unit"),
        ]
    )

    @MainActor private static let driftTreatment = DesignExperiment(
        id: "inventory-field-drift-treatment",
        question:
            "What does the phone show when a deploy narrows a field under items already on it?",
        subject: subject,
        variants: [
            variant(
                "flagged-inline", "Flagged inline",
                note:
                    "A problem notice sits under the value. Loudest, and the most work to build for a rare event.",
                style: .init(driftTreatment: .flaggedInline), opening: "drift"),
            variant(
                "grayed-legacy", "Muted, labelled legacy",
                note:
                    "The value reads, dimmed, with a small \"no longer offered\" chip. Quieter than a warning.",
                style: .init(driftTreatment: .grayedLegacy), opening: "drift"),
            variant(
                "silently-kept", "Unmarked",
                note: "Nothing distinguishes it from a current value. The ceiling, for comparison.",
                style: .init(driftTreatment: .silentlyKept), opening: "drift"),
        ]
    )

    @MainActor private static let validationOutcome = DesignExperiment(
        id: "inventory-field-validation-outcome",
        question: "Does a value outside a field's list block the save, or park the item?",
        subject: subject,
        variants: [
            variant(
                "blocks-save", "Blocks the save",
                note:
                    "Save is disabled until the value is one the type declares. Nothing invalid ever lands.",
                style: .init(validationOutcome: .blocksSave), opening: "validation"),
            variant(
                "parks-for-review", "Saves, parked for review",
                note:
                    "The item saves with a needs-attention mark. Nothing is lost if the entry is interrupted.",
                style: .init(validationOutcome: .parksForReview), opening: "validation"),
            variant(
                "suggests-correction", "Suggests the closest match",
                note:
                    "Offers E27 as the likely intent. Fastest when the typo is close; wrong for a genuinely new value.",
                style: .init(validationOutcome: .suggestsCorrection), opening: "validation"),
        ]
    )

    @MainActor
    private static func variant(
        _ id: String,
        _ title: String,
        note: String,
        style: InventoryFieldStyle,
        opening: String
    ) -> DesignVariant {
        DesignVariant(
            id: id, title: title, note: note,
            surface: InventoryFieldStaging.surface(style: style, opening: opening))
    }
}
