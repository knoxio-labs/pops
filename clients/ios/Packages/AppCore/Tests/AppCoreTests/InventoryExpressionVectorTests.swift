import Foundation
import Testing

@testable import AppCore

/// Every vector the server's evaluator generated, replayed through the Swift
/// parser and evaluator. A Swift node that disagrees with the server on any
/// value, reason, failing field, dependency or traversed item fails here.
@Suite("Expression vectors shared with the server")
internal struct InventoryExpressionVectorTests {
    private static let file = Result { try ExpressionVectorFile.load() }

    @Test("the vendored file is the version this evaluator implements")
    func version() throws {
        let file = try Self.file.get()
        #expect(file.version == 1)
        #expect(file.vectors.count > 100)
    }

    @Test("every vector reproduces the server's rejection or result")
    func vectors() throws {
        for vector in try Self.file.get().vectors {
            switch vector.expected.outcome {
            case "rejected": expectRejected(vector)
            default: try expectEvaluated(vector)
            }
        }
    }

    @Test("the vectors evaluate every op this evaluator implements")
    func coverage() throws {
        let covered = try Self.file.get().vectors.flatMap { $0.expected.ops ?? [] }
        #expect(Set(covered) == Set(InventoryExpressionOp.allCases.map(\.rawValue)))
    }

    private func expectRejected(_ vector: ExpressionVectorFile.Vector) {
        do {
            let definition = try definition(vector)
            _ = try definition.evaluate(
                override: try override(vector), catalogueRevision: 1, itemRevision: 1,
                in: ExpressionVectorSnapshot(vector))
            Issue.record("\(vector.name): accepted what the server rejects")
        } catch {
            #expect(error.code == vector.expected.code, "\(vector.name)")
            #expect(error.path == vector.expected.path, "\(vector.name)")
        }
    }

    private func expectEvaluated(_ vector: ExpressionVectorFile.Vector) throws {
        let expected = try #require(vector.expected.value, "\(vector.name)")
        let definition = try definition(vector)
        #expect(
            definition.expression.ops.map(\.rawValue).sorted() == vector.expected.ops,
            "\(vector.name)")
        let snapshot = ExpressionVectorSnapshot(vector)
        let actual = try definition.evaluate(
            override: try override(vector), catalogueRevision: expected.catalogueRevision,
            itemRevision: 3,
            in: snapshot)
        #expect(actual.fieldId == expected.fieldId, "\(vector.name)")
        #expect(actual.catalogueRevision == expected.catalogueRevision, "\(vector.name)")
        #expect(actual.dependencies == expected.dependencies, "\(vector.name)")
        #expect(actual.traversedItemIds == expected.traversedItemIds, "\(vector.name)")
        expectEvaluation(actual.evaluation, expected, vector.name)
        if vector.override == nil {
            let raw = InventoryExpressionEvaluator.evaluate(
                definition.expression, kind: definition.kind, fixedUnit: definition.fixedUnit,
                in: snapshot)
            var code: String?
            if case .error(let failure, _) = raw { code = failure.rawValue }
            #expect(code == vector.expected.evaluationErrorCode, "\(vector.name)")
        }
    }

    private func expectEvaluation(
        _ actual: InventoryComputedEvaluation, _ expected: ExpressionVectorFile.ExpectedValue,
        _ name: String
    ) {
        let expectedValue = expected.values?.first?.value
        switch actual {
        case .ok(let value):
            #expect(expected.state == "ok", "\(name)")
            #expect(
                expectedValue.map { InventoryExpressionValue(value).wireEquals($0) } == true,
                "\(name)")
        case .overridden(let value, let revision):
            #expect(expected.state == "overridden", "\(name)")
            #expect(
                expectedValue.map { InventoryExpressionValue(value).wireEquals($0) } == true,
                "\(name)")
            #expect(revision == expected.override?.catalogueRevision, "\(name)")
        case .unavailable(let reason, let failedFieldId):
            #expect(expected.state == "unavailable", "\(name)")
            #expect(reason == expected.reason, "\(name)")
            #expect(failedFieldId == expected.failedFieldId, "\(name)")
        }
    }

    private func definition(_ vector: ExpressionVectorFile.Vector)
        throws(InventoryExpressionRejection)
        -> InventoryComputedDefinition
    {
        InventoryComputedDefinition(
            fieldId: vector.field.fieldId, kind: vector.field.kind,
            fixedUnit: vector.field.fixedUnit,
            allowOverride: vector.field.allowOverride,
            expression: try InventoryExpression.parse(
                version: vector.expressionVersion, json: vector.expression.json))
    }

    private func override(_ vector: ExpressionVectorFile.Vector)
        throws(InventoryExpressionRejection)
        -> InventoryComputedOverride?
    {
        guard let override = vector.override else { return nil }
        guard
            let value = override.value.value?.canonical(
                kind: vector.field.kind, fixedUnit: vector.field.fixedUnit)
        else {
            throw InventoryExpressionRejection(code: "vector_override_invalid", path: vector.name)
        }
        return InventoryComputedOverride(
            value: value, catalogueRevision: override.catalogueRevision)
    }
}
