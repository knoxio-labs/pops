/// The surface POPS-4015's four experiments are staged against.
///
/// One surface, four states, each answering one question at its default
/// style so the other three stay visibly held at theirs, the same discipline
/// ``InventoryFoundationStaging`` uses for POPS-3979's open questions.
internal enum InventoryFieldStaging {
    /// `opening` names the state a reviewer lands on, matching the question
    /// each experiment is about.
    @MainActor
    internal static func surface(
        style: InventoryFieldStyle,
        opening: String = "choice",
        synopsis: String? = nil
    ) -> DesignSurface {
        let all = states(for: style)
        let ordered = all.filter { $0.id == opening } + all.filter { $0.id != opening }
        return DesignSurface(
            id: SurfaceID(area: "inventory", slug: "field-values"),
            title: "Field values",
            synopsis: synopsis,
            chrome: .navigation,
            states: ordered
        )
    }

    @MainActor
    private static func states(for style: InventoryFieldStyle) -> [DesignState] {
        [
            DesignState("choice", "Choosing Material") {
                InventoryFieldChoiceView(presentation: style.choicePresentation)
            },
            DesignState("unit", "Two tapes, two units") {
                InventoryFieldUnitView(presentation: style.unitPresentation)
            },
            DesignState("drift", "A dropped Fitting value") {
                InventoryFieldDriftView(treatment: style.driftTreatment)
            },
            DesignState("validation", "Typing an unknown Fitting") {
                InventoryFieldValidationOutcomeView(outcome: style.validationOutcome)
            },
        ]
    }
}

internal enum InventoryFieldSurfaces {
    @MainActor internal static let fieldValues = InventoryFieldStaging.surface(
        style: InventoryFieldStyle(),
        synopsis:
            "A choice list, a unit and a validation failure, drawn where POPS-4015's questions are open."
    )

    @MainActor internal static let surfaces: [DesignSurface] = [fieldValues]
}
