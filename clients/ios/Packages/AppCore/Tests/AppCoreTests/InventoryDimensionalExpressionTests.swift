import Foundation
import Testing

@testable import AppCore

/// Expression version 2 on the phone: the unit grammar, the stored-version
/// gate, and the `missingInputs` a stored computed value round-trips. The
/// arithmetic itself is pinned by the shared vectors.
@Suite("Dimensional expressions and missing inputs")
internal struct InventoryDimensionalExpressionTests {
    private static let root = "00000000-0000-4000-8000-000000000101"
    private static let width = "00000000-0000-4000-8000-00000000020d"
    private static let height = "00000000-0000-4000-8000-00000000020e"

    private struct Box: InventoryExpressionSnapshot {
        let rootItemId = InventoryDimensionalExpressionTests.root
        func item(_ itemId: String) -> InventoryExpressionItemState {
            itemId == rootItemId ? .resolved(revision: 1) : .missing
        }
        func field(itemId: String, fieldId: String) -> InventoryExpressionField? {
            switch fieldId {
            case InventoryDimensionalExpressionTests.width:
                return .value(.measurement(amount: "20", unit: "cm"), revision: 1)
            case InventoryDimensionalExpressionTests.height:
                return .value(.measurement(amount: "30", unit: "cm"), revision: 1)
            default: return nil
            }
        }
    }

    private static func read(_ fieldId: String) -> InventoryJSON {
        .object(["op": .string("read"), "path": .array([]), "fieldId": .string(fieldId)])
    }

    private static let area = InventoryJSON.object([
        "op": .string("multiply"), "left": read(width), "right": read(height),
    ])

    private static func field(version: Int, unit: String) -> InventoryCatalogueField {
        InventoryCatalogueField(
            id: "00000000-0000-4000-8000-000000000201", typeId: "type", key: "area",
            label: "Area", sortOrder: 0, kind: .measurement, cardinality: .one, required: false,
            storage: .computed, fixedUnit: unit, expressionVersion: version, expression: area)
    }

    @Test("unit terms parse and write back the server's canonical grammar")
    func grammar() {
        for unit in ["cm", "cm²", "kg/m³", "kg·m/s²", "1/s", "rpm¹²"] {
            #expect(
                InventoryMeasurementUnits.parseTerm(unit).map(InventoryMeasurementUnits.format)
                    == unit, "\(unit)")
        }
        for unit in [
            "", "cm¹", "cm¹⁰⁰", "cm⁰²", "fl oz", "m/s/s", "cm·cm", "1", "m⁻¹", "a\u{FEFF}b",
        ] {
            #expect(InventoryMeasurementUnits.parseTerm(unit) == nil, "\(unit)")
        }
    }

    @Test("symbols compare by code unit, so canonically equal spellings are different units")
    func codeUnitSymbols() {
        let precomposed = "\u{00E9}"
        let decomposed = "e\u{0301}"
        #expect(InventoryMeasurementUnits.conversionShift(from: precomposed, to: decomposed) == nil)
        #expect(
            InventoryMeasurementUnits.combine(precomposed, decomposed, sign: 1)?.term.count == 2)
        #expect(InventoryMeasurementUnits.conversionShift(from: "cm³", to: "L") == -3)
        #expect(InventoryMeasurementUnits.conversionShift(from: "cm²", to: "L") == nil)
    }

    @Test("a version-2 field derives and converts; version 1 refuses the same expression")
    func versionGate() throws {
        let derived = try InventoryComputedDefinition(Self.field(version: 2, unit: "mm²"))
        #expect(derived.expressionVersion == 2)
        let value = try derived.evaluate(
            override: nil, catalogueRevision: 1, itemRevision: 1, in: Box())
        #expect(
            value.evaluation
                == .ok(.measurement(amount: try InventoryDecimal("60000"), unit: "mm²")))

        let legacy = try InventoryComputedDefinition(Self.field(version: 1, unit: "cm²"))
        let refused = try legacy.evaluate(
            override: nil, catalogueRevision: 1, itemRevision: 1, in: Box())
        #expect(
            refused.evaluation
                == .unavailable(reason: "evaluation_error", failedFieldId: legacy.fieldId))
        #expect(refused.missingInputs.isEmpty)
    }

    @Test("a version this build does not evaluate is refused, so the server's value stands")
    func futureVersionRefused() {
        #expect(
            throws: InventoryExpressionRejection(
                code: "expression_version_unknown", path: "expressionVersion")
        ) {
            try InventoryComputedDefinition(Self.field(version: 3, unit: "cm²"))
        }
    }

    @Test("a missing read names its field and item")
    func missingRead() throws {
        let missing = "00000000-0000-4000-8000-00000000020c"
        let expression = InventoryJSON.object([
            "op": .string("coalesce"), "values": .array([Self.read(missing), Self.read("other")]),
        ])
        let definition = InventoryComputedDefinition(
            fieldId: "computed", kind: .measurement, fixedUnit: "cm", allowOverride: false,
            expression: try InventoryExpression.parse(version: 2, json: expression),
            expressionVersion: 2)
        let value = try definition.evaluate(
            override: nil, catalogueRevision: 1, itemRevision: 1, in: Box())
        #expect(
            value.missingInputs == [
                InventoryExpressionMissingInput(
                    reason: "missing_dependency", fieldId: missing, itemId: Self.root),
                InventoryExpressionMissingInput(
                    reason: "missing_dependency", fieldId: "other", itemId: Self.root),
            ])
    }

    @Test("a stored value from before missingInputs decodes with none, and a new one round-trips")
    func storedValues() throws {
        let legacy = Data(
            """
            {"fieldId":"f","catalogueRevision":1,"evaluation":{"unavailable":\
            {"reason":"missing_dependency","failedFieldId":"g"}},\
            "dependencies":[],"traversedItemIds":["i"],"evaluatedItemRevision":2}
            """.utf8)
        let decoded = try JSONDecoder().decode(InventoryComputedValue.self, from: legacy)
        #expect(decoded.missingInputs.isEmpty)
        #expect(
            decoded.evaluation == .unavailable(reason: "missing_dependency", failedFieldId: "g"))

        let current = InventoryComputedValue(
            fieldId: "f", catalogueRevision: 1,
            evaluation: .unavailable(reason: "missing_dependency", failedFieldId: "g"),
            dependencies: [], traversedItemIds: ["i"], evaluatedItemRevision: 2,
            missingInputs: [
                InventoryExpressionMissingInput(
                    reason: "missing_dependency", fieldId: "h", itemId: "i"),
                InventoryExpressionMissingInput(
                    reason: "missing_dependency", fieldId: "g", itemId: "i"),
            ])
        let roundTripped = try JSONDecoder().decode(
            InventoryComputedValue.self, from: JSONEncoder().encode(current))
        #expect(roundTripped == current)
    }
}
