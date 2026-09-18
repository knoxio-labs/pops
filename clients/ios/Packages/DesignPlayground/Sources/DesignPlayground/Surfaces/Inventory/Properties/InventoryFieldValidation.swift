/// Whether a value obeys the field that declares it, and what to do when a
/// compatible unit does not match it exactly.
///
/// POPS-4015 narrowed to this: the source of a field's allowed values and its
/// unit is the type's code definition, decided already (see
/// `pillars/inventory/docs/architecture/adr-001-domain-vocabulary.md`). What
/// is left is what a screen does with a value the definition rejects, whether
/// that value is being typed right now or was written down before the
/// definition changed underneath it. Both moments call ``validate(_:against:)``;
/// the experiments differ only in what they do with the outcome.
internal enum InventoryFieldValidation {
    internal enum Outcome: Equatable {
        case valid
        /// A choice outside the field's list, carried so a screen can offer
        /// the list rather than just saying no.
        case outsideChoices(allowed: [String])
        case unsupportedUnit(reason: String)
    }

    internal static func validate(
        _ value: InventoryPropertyValue,
        against field: InventoryTemplateField
    ) -> Outcome {
        switch value {
        case .choice(let chosen):
            guard let choices = field.choices else { return .valid }
            return choices.contains(chosen) ? .valid : .outsideChoices(allowed: choices)
        case .measure(_, let unit), .span(_, _, let unit):
            return validateUnit(unit, against: field)
        case .text, .flag, .link:
            return .valid
        }
    }

    private static func validateUnit(
        _ unit: String,
        against field: InventoryTemplateField
    ) -> Outcome {
        guard let recorded = InventoryUnit.named(unit) else {
            return .unsupportedUnit(reason: "\"\(unit)\" is not a unit the catalogue recognises")
        }
        guard let declared = field.unit, let expected = InventoryUnit.named(declared) else {
            return .valid
        }
        guard expected.dimension == recorded.dimension else {
            return .unsupportedUnit(
                reason:
                    "\(unit) measures \(recorded.dimension); \(field.key) is \(expected.dimension)"
            )
        }
        return .valid
    }
}

/// Converting a measurement between units the catalogue knows, and refusing
/// the ones it does not.
///
/// Only length has more than one known unit today (millimetres, centimetres,
/// metres), so that is the dimension every conversion example in the field
/// experiments uses; the mechanism is not specific to it.
internal enum InventoryUnitConversion {
    internal enum Outcome: Equatable {
        case converted(Double, unit: String)
        case refused(reason: String)
    }

    internal static func convert(_ amount: Double, from source: String, to target: String)
        -> Outcome
    {
        guard let sourceUnit = InventoryUnit.named(source) else {
            return .refused(reason: "\"\(source)\" is not a unit the catalogue recognises")
        }
        guard let targetUnit = InventoryUnit.named(target) else {
            return .refused(reason: "\"\(target)\" is not a unit the catalogue recognises")
        }
        guard sourceUnit.dimension == targetUnit.dimension else {
            return .refused(
                reason: "\(source) measures \(sourceUnit.dimension), not \(targetUnit.dimension)")
        }
        let converted = amount * sourceUnit.multiplier / targetUnit.multiplier
        return .converted(converted, unit: target)
    }
}
