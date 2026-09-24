import Foundation

@testable import AppCore

/// Raw JSON with numbers kept as text, so a literal reaches the parser as the
/// server's `JSON.parse` would hand it over.
internal struct RawJSON: Decodable, Sendable {
    let json: InventoryJSON

    init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            json = .null
        } else if let boolean = try? container.decode(Bool.self) {
            json = .boolean(boolean)
        } else if let integer = try? container.decode(Int64.self) {
            json = .number(String(integer))
        } else if let number = try? container.decode(Double.self) {
            json = .number(String(number))
        } else if let text = try? container.decode(String.self) {
            json = .string(text)
        } else if let array = try? container.decode([RawJSON].self) {
            json = .array(array.map(\.json))
        } else {
            json = .object(try container.decode([String: RawJSON].self).mapValues(\.json))
        }
    }

    /// The wire value this JSON spells, or nil when it spells none.
    var value: InventoryExpressionValue? {
        guard case .value(let value) = InventoryExpressionValue.parse(json) else { return nil }
        return value
    }
}

/// `clients/ios/Contracts/expression-vectors-v1.json`, vendored byte for byte
/// from `pillars/inventory/contracts/`, which the server's evaluator generates.
internal struct ExpressionVectorFile: Decodable, Sendable {
    struct Field: Decodable, Sendable {
        let fieldId: String
        let kind: InventoryPrimitiveKind
        let fixedUnit: String?
        let allowOverride: Bool
    }

    struct Override: Decodable, Sendable {
        let value: RawJSON
        let catalogueRevision: Int
    }

    struct ItemField: Decodable, Sendable {
        let fieldId: String
        let state: String
        let value: RawJSON?
        let revision: Int
        let dependencies: [InventoryValueDependency]?
        let reason: InventoryValueUnavailableReason?
        let failedFieldId: String?
        let traversedItemIds: [String]?
        let missingInputs: [InventoryExpressionMissingInput]?
    }

    struct Item: Decodable, Sendable {
        let id: String
        let state: String
        let revision: Int
        let fields: [ItemField]
    }

    struct OverrideRevision: Decodable, Sendable { let catalogueRevision: Int }

    struct ExpectedValue: Decodable, Sendable {
        let fieldId: String
        let catalogueRevision: Int
        let state: String
        let values: [RawJSON]?
        let override: OverrideRevision?
        let reason: String?
        let failedFieldId: String?
        let missingInputs: [InventoryExpressionMissingInput]?
        let dependencies: [InventoryValueDependency]
        let traversedItemIds: [String]
    }

    struct Expected: Decodable, Sendable {
        let outcome: String
        let code: String?
        let path: String?
        let ops: [String]?
        let evaluationErrorCode: String?
        let value: ExpectedValue?
    }

    struct Vector: Decodable, Sendable {
        let name: String
        let expressionVersion: Int
        let expression: RawJSON
        let field: Field
        let override: Override?
        let rootItemId: String
        let items: [Item]
        let expected: Expected
    }

    let version: Int
    let vectors: [Vector]

    static let relativePath = "Contracts/expression-vectors-v1.json"

    /// Walks up from this file until the vendored copy appears.
    static func load(from sourceFile: String = #filePath) throws -> ExpressionVectorFile {
        var directory = URL(fileURLWithPath: sourceFile).deletingLastPathComponent()
        while directory.path != "/" {
            let candidate = directory.appendingPathComponent(relativePath)
            if FileManager.default.fileExists(atPath: candidate.path) {
                return try JSONDecoder().decode(Self.self, from: Data(contentsOf: candidate))
            }
            directory.deleteLastPathComponent()
        }
        throw CocoaError(.fileNoSuchFile)
    }
}

/// A vector's items as an evaluation snapshot; an unlisted item is missing.
internal struct ExpressionVectorSnapshot: InventoryExpressionSnapshot {
    let rootItemId: String
    let items: [String: ExpressionVectorFile.Item]

    init(_ vector: ExpressionVectorFile.Vector) {
        rootItemId = vector.rootItemId
        items = Dictionary(uniqueKeysWithValues: vector.items.map { ($0.id, $0) })
    }

    func item(_ itemId: String) -> InventoryExpressionItemState {
        guard let item = items[itemId] else { return .missing }
        switch item.state {
        case "resolved": return .resolved(revision: item.revision)
        case "unresolved": return .unresolved
        case "deleted": return .deleted
        default: return .missing
        }
    }

    func field(itemId: String, fieldId: String) -> InventoryExpressionField? {
        guard let item = items[itemId], item.state == "resolved",
            let field = item.fields.first(where: { $0.fieldId == fieldId })
        else { return nil }
        let dependencies = field.dependencies ?? []
        if field.state == "value", let value = field.value?.value {
            return .value(value, revision: field.revision, dependencies: dependencies)
        }
        guard let reason = field.reason, let failedFieldId = field.failedFieldId else { return nil }
        let unavailable = InventoryExpressionUnavailable(
            reason: reason, failedFieldId: failedFieldId,
            traversedItemIds: field.traversedItemIds ?? [], missingInputs: field.missingInputs ?? []
        )
        return .unavailable(unavailable, revision: field.revision, dependencies: dependencies)
    }
}
