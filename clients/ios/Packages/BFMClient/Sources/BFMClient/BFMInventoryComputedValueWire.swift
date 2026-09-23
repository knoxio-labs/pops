import AppCore
import Foundation
import OpenAPIRuntime

/// One `computedValues` entry, independent of which operation produced it.
///
/// The generator gives the snapshot and the change feed each their own
/// three-case `oneOf` type for this entry; rather than map both field for
/// field, each is re-encoded and read back through this one decoder, which
/// switches on the closed `state` exactly as the contract discriminates it.
internal struct WireComputedValue: Decodable {
    private enum CodingKeys: String, CodingKey {
        case fieldId, catalogueRevision, state, values, override, reason, failedFieldId
        case dependencies, traversedItemIds
    }

    private struct OverrideProvenance: Decodable {
        let catalogueRevision: Int
    }

    private enum Evaluation {
        case ok(OpenAPIValueContainer)
        case overridden(OpenAPIValueContainer, overrideCatalogueRevision: Int)
        case unavailable(reason: String, failedFieldId: String)
    }

    private let fieldId: String
    private let catalogueRevision: Int
    private let evaluation: Evaluation
    private let dependencies: [InventoryValueDependency]
    private let traversedItemIds: [String]

    internal init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        fieldId = try container.decode(String.self, forKey: .fieldId)
        catalogueRevision = try container.decode(Int.self, forKey: .catalogueRevision)
        dependencies = try container.decode([InventoryValueDependency].self, forKey: .dependencies)
        traversedItemIds = try container.decode([String].self, forKey: .traversedItemIds)
        switch try container.decode(String.self, forKey: .state) {
        case "ok":
            evaluation = .ok(try Self.only(container))
        case "overridden":
            let provenance = try container.decode(OverrideProvenance.self, forKey: .override)
            evaluation = .overridden(
                try Self.only(container), overrideCatalogueRevision: provenance.catalogueRevision)
        case "unavailable":
            evaluation = .unavailable(
                reason: try container.decode(String.self, forKey: .reason),
                failedFieldId: try container.decode(String.self, forKey: .failedFieldId))
        default:
            throw RepositoryError.contractMismatch
        }
    }

    private static func only(_ container: KeyedDecodingContainer<CodingKeys>) throws
        -> OpenAPIValueContainer
    {
        let values = try container.decode([OpenAPIValueContainer].self, forKey: .values)
        guard values.count == 1, let value = values.first else {
            throw RepositoryError.contractMismatch
        }
        return value
    }

    /// Reads the generated entries of either operation.
    internal static func rows(_ generated: [some Encodable]) throws -> [WireComputedValue] {
        try JSONDecoder().decode([WireComputedValue].self, from: JSONEncoder().encode(generated))
    }

    /// The domain value, stamped with the revision of the item row it came with.
    internal func domainValue(evaluatedItemRevision: Int) throws -> InventoryComputedValue {
        let domainEvaluation: InventoryComputedEvaluation
        switch evaluation {
        case .ok(let value):
            domainEvaluation = .ok(try protocol2Value(from: value))
        case .overridden(let value, let revision):
            domainEvaluation = .overridden(
                try protocol2Value(from: value), overrideCatalogueRevision: revision)
        case .unavailable(let reason, let failedFieldId):
            domainEvaluation = .unavailable(reason: reason, failedFieldId: failedFieldId)
        }
        return InventoryComputedValue(
            fieldId: fieldId, catalogueRevision: catalogueRevision, evaluation: domainEvaluation,
            dependencies: dependencies, traversedItemIds: traversedItemIds,
            evaluatedItemRevision: evaluatedItemRevision)
    }
}
