import Testing

@testable import DesignPlayground

/// The property vocabulary's rules, which are the part of
/// `inventory-item-properties` that a screenshot cannot settle: what counts as
/// the same key, what a template change does to data, and what a property
/// search can actually reach.
@Suite("Inventory property schema")
internal struct InventoryPropertySchemaTests {
    @Test("keys differing only in case, spacing or punctuation are one key")
    func normalizationCollapsesSpelling() {
        #expect(InventoryPropertySchema.normalized("Cable length") == "cable length")
        #expect(InventoryPropertySchema.normalized("  cable-length ") == "cable length")
        #expect(InventoryPropertySchema.normalized("Cable_Length") == "cable length")
        #expect(InventoryPropertySchema.normalized("cable  length") == "cable length")
    }

    @Test("keys that differ in a word are different keys")
    func normalizationKeepsRealDifferences() {
        #expect(
            InventoryPropertySchema.normalized("Length")
                != InventoryPropertySchema.normalized("Cable length"))
    }

    @Test("a duplicate is found through its spelling, and only through a real collision")
    func duplicateDetection() {
        let existing = [InventoryProperty("Cable length", .measure(4, unit: "ft"), origin: .custom)]

        #expect(
            InventoryPropertySchema.duplicate(of: "cable-length", in: existing)?.key
                == "Cable length")
        #expect(InventoryPropertySchema.duplicate(of: "Length", in: existing) == nil)
        #expect(InventoryPropertySchema.duplicate(of: "   ", in: existing) == nil)
        #expect(InventoryPropertySchema.duplicate(of: "Cable length", in: []) == nil)
    }

    @Test("a unit outside the catalogue's list is unsupported, and no unit at all is not")
    func unsupportedUnits() {
        let properties = [
            InventoryProperty("Length", .measure(2, unit: "m")),
            InventoryProperty("Cable length", .measure(4, unit: "ft")),
            InventoryProperty("Braided", .flag(true)),
            InventoryProperty("Colour temperature", .span(low: 2200, high: 6500, unit: "kelvin")),
        ]

        let flagged = InventoryPropertySchema.unsupportedUnits(in: properties).map(\.key)

        #expect(flagged == ["Cable length", "Colour temperature"])
    }

    @Test("values read the way they are written, including whole numbers and ranges")
    func valueDisplay() {
        #expect(InventoryPropertyValue.measure(2, unit: "m").display == "2 m")
        #expect(InventoryPropertyValue.measure(0.48, unit: "Gbps").display == "0.48 Gbps")
        #expect(
            InventoryPropertyValue.span(low: 2200, high: 6500, unit: "K").display == "2200–6500 K")
        #expect(InventoryPropertyValue.flag(false).display == "No")
        #expect(InventoryPropertyValue.text("centre positive").display == "centre positive")
    }
}

/// Changing what an object is must not cost it what it knows, the failure
/// that makes people stop using templates at all.
@Suite("Inventory template change")
internal struct InventoryTemplateChangeTests {
    private var cable: InventoryThing { InventoryPropertyFixtures.cable }

    @Test("fields the new template asks for are kept and belong to it")
    func matchingFieldsSurvive() {
        let change = InventoryTemplateChange(
            thing: cable, changingTo: InventoryPropertyTemplates.cable)

        #expect(change.kept.map(\.key).contains("Length"))
        #expect(change.kept.allSatisfy { $0.origin == .template })
    }

    @Test("a value the new template never asked for survives as a custom property")
    func unaskedValuesAreCarried() {
        let change = InventoryTemplateChange(
            thing: cable, changingTo: InventoryPropertyTemplates.tape)

        #expect(change.kept.map(\.key) == ["Length"])
        #expect(change.carriedAsCustom.map(\.key).contains("End A"))
        #expect(change.carriedAsCustom.allSatisfy { $0.origin == .custom })
        #expect(change.kept.count + change.carriedAsCustom.count == cable.properties.count)
    }

    @Test("a custom property stays custom rather than being adopted by the new template")
    func customPropertiesAreNeverAdopted() {
        let change = InventoryTemplateChange(
            thing: cable, changingTo: InventoryPropertyTemplates.cable)

        #expect(change.carriedAsCustom.map(\.key) == ["Bought with"])
    }

    @Test("fields nothing filled in are reported blank rather than silently absent")
    func blankFieldsAreReported() {
        let change = InventoryTemplateChange(
            thing: InventoryPropertyFixtures.sideboard,
            changingTo: InventoryPropertyTemplates.furniture)

        #expect(change.blankFields.map(\.key) == ["Footprint", "Material", "Needs two people"])
        #expect(change.kept.isEmpty)
    }

    @Test("a key the object already has does not come back as a blank field")
    func filledFieldsAreNotBlank() {
        let change = InventoryTemplateChange(
            thing: cable, changingTo: InventoryPropertyTemplates.cable)

        #expect(change.blankFields.isEmpty)
    }
}

/// What a property search can and cannot reach, which is the consequence the
/// experiment is really deciding.
@Suite("Inventory property search")
internal struct InventoryPropertyClauseTests {
    private var catalogue: [InventoryThing] { InventoryPropertyFixtures.all }

    @Test(
        "the staged query finds the cables that carry enough power and not the ones that do not")
    func stagedQueryDiscriminates() {
        let matches = InventoryPropertyFixtures.query.matching(catalogue).map(\.id)

        #expect(matches == ["cable-1m", "cable-usbc"])
    }

    @Test("a clause on a key an item does not have excludes it rather than matching loosely")
    func missingKeysDoNotMatch() {
        let clause = InventoryPropertyClause(key: "Power", comparison: .present)

        #expect(!clause.matches(InventoryPropertyFixtures.sideboard))
        #expect(clause.matches(InventoryPropertyFixtures.cable))
    }

    @Test("equality ignores case but not content")
    func equalityComparison() {
        let fitting = InventoryPropertyClause(key: "Fitting", comparison: .equals, value: "e27")

        #expect(fitting.matches(InventoryPropertyFixtures.bulb))
        #expect(
            !InventoryPropertyClause(key: "Fitting", comparison: .equals, value: "GU10")
                .matches(InventoryPropertyFixtures.bulb))
    }

    @Test("a numeric clause cannot compare a value that is not a number")
    func numericComparisonNeedsANumber() {
        let clause = InventoryPropertyClause(key: "Footprint", comparison: .atLeast, value: "10")

        #expect(!clause.matches(InventoryPropertyFixtures.box))
        #expect(
            InventoryPropertyClause(key: "Load limit", comparison: .atLeast, value: "10")
                .matches(InventoryPropertyFixtures.box))
    }

    @Test("a range answers a lower bound with its low end")
    func rangesCompareFromTheirFloor() {
        let clause = InventoryPropertyClause(
            key: "Colour temperature", comparison: .atLeast, value: "3000")

        #expect(!clause.matches(InventoryPropertyFixtures.bulb))
    }

    @Test("clauses are conjunctive")
    func everyClauseHasToHold() {
        let impossible = [
            InventoryPropertyClause(key: "Fitting", comparison: .equals, value: "E27"),
            InventoryPropertyClause(key: "Braided", comparison: .present),
        ]

        #expect(impossible.matching(catalogue).isEmpty)
    }
}

/// Two objects line up only on keys they both understand.
@Suite("Inventory comparison")
internal struct InventoryComparisonTests {
    @Test("custom keys are left out of the comparison's rows")
    func comparisonUsesSharedVocabulary() {
        let keys = InventoryComparison.keys(across: InventoryPropertyFixtures.cables)

        #expect(keys == ["End A", "End B", "Data rate", "Power", "Length", "Braided"])
        #expect(!keys.contains("Bought with"))
    }

    @Test("a key only one object has still gets a row")
    func oneSidedKeysStillAppear() {
        let keys = InventoryComparison.keys(
            across: [InventoryPropertyFixtures.cable, InventoryPropertyFixtures.bulb])

        #expect(keys.contains("Fitting"))
        #expect(keys.first == "End A")
    }

    @Test("a difference is a difference, including one side saying nothing")
    func differencesAreDetected() {
        let cables = InventoryPropertyFixtures.cables

        #expect(!InventoryComparison.differs(on: "End A", across: cables))
        #expect(InventoryComparison.differs(on: "Power", across: cables))
        #expect(
            InventoryComparison.differs(
                on: "Fitting",
                across: [InventoryPropertyFixtures.cable, InventoryPropertyFixtures.bulb]))
    }
}
