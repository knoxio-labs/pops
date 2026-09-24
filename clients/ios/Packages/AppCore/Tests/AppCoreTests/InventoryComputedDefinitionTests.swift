import Foundation
import Testing

@testable import AppCore

@Suite("Computed definitions read from a catalogue")
internal struct InventoryComputedDefinitionTests {
    private static let root = "00000000-0000-4000-8000-000000000101"

    private static func field(
        storage: InventoryFieldStorage = .computed, expression: InventoryJSON?
    ) -> InventoryCatalogueField {
        InventoryCatalogueField(
            id: "00000000-0000-4000-8000-000000000201", typeId: "type", key: "total",
            label: "Total",
            sortOrder: 0, kind: .integer, cardinality: .one, required: false, storage: storage,
            expressionVersion: expression == nil ? nil : 1, expression: expression)
    }

    private struct Empty: InventoryExpressionSnapshot {
        let rootItemId = InventoryComputedDefinitionTests.root
        func item(_ itemId: String) -> InventoryExpressionItemState {
            itemId == rootItemId ? .resolved(revision: 1) : .missing
        }
        func field(itemId: String, fieldId: String) -> InventoryExpressionField? { nil }
    }

    private static func literal(_ number: String) -> InventoryJSON {
        .object(["op": .string("literal"), "value": .number(number)])
    }

    @Test("a catalogue field's expression parses and evaluates")
    func parsesCatalogueField() throws {
        let definition = try InventoryComputedDefinition(
            Self.field(expression: Self.literal("7")), fieldKinds: [:])
        let value = try definition.evaluate(
            override: nil, catalogueRevision: 4, itemRevision: 2, in: Empty())
        #expect(value.evaluation == .ok(.integer(try InventoryInteger(7))))
        #expect(value.catalogueRevision == 4)
        #expect(value.evaluatedItemRevision == 2)
        #expect(value.traversedItemIds == [Self.root])
    }

    @Test("a number literal is read as JavaScript reads it: 7.0 and 7e0 are the integer 7")
    func integralNumberSpellings() throws {
        for spelling in ["7.0", "7e0"] {
            let expression = try InventoryExpression.parse(version: 1, json: Self.literal(spelling))
            #expect(expression == .literal(.integer(7)))
        }
    }

    @Test("a stored field has no expression to evaluate")
    func storedFieldRefused() {
        #expect(
            throws: InventoryExpressionRejection(
                code: "computed_expression_required", path: "00000000-0000-4000-8000-000000000201")
        ) {
            try InventoryComputedDefinition(
                Self.field(storage: .stored, expression: nil), fieldKinds: [:])
        }
    }

    @Test("syntax this build does not know is refused, not guessed at")
    func unknownNodeRefused() {
        let json = InventoryJSON.object(["op": .string("modulo"), "args": .array([])])
        #expect(
            throws: InventoryExpressionRejection(
                code: "expression_op_unknown", path: "expression.op")
        ) {
            try InventoryComputedDefinition(
                Self.field(expression: json), fieldKinds: [:])
        }
    }
}
