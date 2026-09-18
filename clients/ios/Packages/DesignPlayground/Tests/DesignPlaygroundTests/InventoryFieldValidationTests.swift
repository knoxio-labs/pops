import Testing

@testable import DesignPlayground

/// Whether a value obeys the field that declares it, which is the part of
/// POPS-4015 a screenshot cannot check: a picker that looks right and a
/// picker that is right are the same screenshot.
@Suite("Inventory field validation")
internal struct InventoryFieldValidationTests {
    private var fitting: InventoryTemplateField {
        InventoryPropertyTemplates.bulb.fields.first { $0.key == "Fitting" }
            ?? InventoryTemplateField("Fitting", "Choice")
    }
    private var width: InventoryTemplateField {
        InventoryPropertyTemplates.tape.fields.first { $0.key == "Width" }
            ?? InventoryTemplateField("Width", "Measurement")
    }

    @Test("a choice on the list is valid")
    func validChoice() {
        #expect(
            InventoryFieldValidation.validate(.choice("E27"), against: fitting) == .valid)
    }

    @Test("a choice outside the list carries the list, not just a refusal")
    func choiceOutsideTheList() {
        let outcome = InventoryFieldValidation.validate(.choice("E5"), against: fitting)

        #expect(outcome == .outsideChoices(allowed: ["E27", "GU10", "B22"]))
    }

    @Test("a value in a unit the catalogue does not know is unsupported")
    func unrecognisedUnit() {
        let outcome = InventoryFieldValidation.validate(.measure(0.75, unit: "in"), against: width)

        guard case .unsupportedUnit = outcome else {
            Issue.record("expected .unsupportedUnit, got \(outcome)")
            return
        }
    }

    @Test("a value in a recognised unit of the wrong dimension is unsupported")
    func wrongDimension() {
        let outcome = InventoryFieldValidation.validate(.measure(2, unit: "kg"), against: width)

        guard case .unsupportedUnit = outcome else {
            Issue.record("expected .unsupportedUnit, got \(outcome)")
            return
        }
    }

    @Test("a value in a recognised unit of the right dimension is valid, whichever length unit")
    func recognisedLengthUnitIsValid() {
        #expect(
            InventoryFieldValidation.validate(.measure(19, unit: "mm"), against: width) == .valid)
        #expect(
            InventoryFieldValidation.validate(.measure(1.9, unit: "cm"), against: width) == .valid)
    }

    @Test("text, flags and links carry no unit or list, so nothing can be outside either")
    func unconstrainedKindsAreAlwaysValid() {
        let hint = InventoryTemplateField("Notes", "Text")

        #expect(InventoryFieldValidation.validate(.text("anything"), against: hint) == .valid)
        #expect(InventoryFieldValidation.validate(.flag(true), against: hint) == .valid)
    }
}

/// Converting a measurement between units the catalogue knows, and refusing
/// the ones it does not, since a picker that silently mis-converts is worse
/// than one that refuses.
@Suite("Inventory unit conversion")
internal struct InventoryUnitConversionTests {
    @Test("converting within a dimension scales by the units' multipliers")
    func convertsWithinADimension() {
        guard
            case .converted(let amount, let unit) = InventoryUnitConversion.convert(
                150, from: "cm", to: "m")
        else {
            Issue.record("expected a conversion")
            return
        }

        #expect(unit == "m")
        #expect(abs(amount - 1.5) < 0.0001)
    }

    @Test("converting to the same unit is a no-op conversion")
    func convertingToItself() {
        #expect(InventoryUnitConversion.convert(4, from: "m", to: "m") == .converted(4, unit: "m"))
    }

    @Test("a source unit the catalogue does not know is refused")
    func refusesAnUnknownSource() {
        guard case .refused = InventoryUnitConversion.convert(1, from: "in", to: "cm") else {
            Issue.record("expected a refusal")
            return
        }
    }

    @Test("converting across dimensions is refused rather than silently scaled")
    func refusesAcrossDimensions() {
        guard case .refused = InventoryUnitConversion.convert(1, from: "m", to: "kg") else {
            Issue.record("expected a refusal")
            return
        }
    }
}
