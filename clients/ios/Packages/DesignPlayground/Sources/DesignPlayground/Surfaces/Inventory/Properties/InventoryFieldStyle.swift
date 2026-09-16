/// The four open questions POPS-4015 leaves, as the knobs a screen turns.
///
/// A choice field's values and a field's unit are declared by the type's code
/// definition, decided already (see
/// `pillars/inventory/docs/architecture/adr-001-domain-vocabulary.md`). What
/// is left is presentation: how a long choice list is offered, what a unit
/// looks like on entry and in search, what a deploy that narrows a field does
/// to items already on it, and whether a value the definition rejects blocks
/// the save or parks the item. Each experiment varies exactly one of these and
/// holds the rest at their defaults.
internal struct InventoryFieldStyle: Equatable {
    /// How a choice field with more entries than fit on one line is offered.
    internal enum ChoicePresentation: Equatable {
        case inlineChips
        case sheetList
        case searchableList
    }

    /// Where a field's unit shows: beside the value being entered, as a
    /// separate control, or only in the label.
    internal enum UnitPresentation: Equatable {
        case suffixInField
        case segmentedControl
        case labelOnly
    }

    /// What happens to a value a since-changed definition no longer lists.
    internal enum DriftTreatment: Equatable {
        case flaggedInline
        case grayedLegacy
        case silentlyKept
    }

    /// What a value outside the field's declared list does to the save.
    internal enum ValidationOutcome: Equatable {
        case blocksSave
        case parksForReview
        case suggestsCorrection
    }

    internal var choicePresentation: ChoicePresentation = .inlineChips
    internal var unitPresentation: UnitPresentation = .suffixInField
    internal var driftTreatment: DriftTreatment = .flaggedInline
    internal var validationOutcome: ValidationOutcome = .blocksSave
}
