import AppCore
import Foundation

@testable import FeatureInventory

internal enum InventoryPrefillTestSupport {
    internal static func field(
        id: String, key: String? = nil, label: String? = nil, sortOrder: Int = 0,
        kind: InventoryPrimitiveKind = .shortText,
        cardinality: InventoryFieldCardinality = .one, required: Bool = false,
        storage: InventoryFieldStorage = .stored, fixedUnit: String? = nil,
        help: String? = nil, archivedAt: String? = nil,
        defaultValues: [InventoryPrimitiveValue] = [],
        enumOptions: [InventoryCatalogueOption] = []
    ) -> InventoryCatalogueField {
        InventoryCatalogueField(
            id: id, typeId: "type", key: key ?? id, label: label ?? id,
            help: help, sortOrder: sortOrder, kind: kind, cardinality: cardinality,
            required: required, storage: storage, fixedUnit: fixedUnit,
            defaultValues: defaultValues, archivedAt: archivedAt, enumOptions: enumOptions)
    }

    internal static func type(
        fields: [InventoryCatalogueField]
    ) -> InventoryCatalogueType {
        InventoryCatalogueType(
            id: "type", key: "type", label: "Type", sortOrder: 0, fields: fields)
    }

    internal static func draft(
        fields: [InventoryCatalogueField]
    ) -> InventoryProtocol2Draft {
        InventoryProtocol2Draft(type: type(fields: fields), catalogueRevision: 1)
    }

    internal static func option(
        id: String, label: String, sortOrder: Int = 0, archivedAt: String? = nil
    ) -> InventoryCatalogueOption {
        InventoryCatalogueOption(
            id: id, key: id, label: label, sortOrder: sortOrder, archivedAt: archivedAt)
    }
}

private struct InventoryPrefillGeneratorFailure: Error {}

internal actor RecordingInventoryPrefillGenerator: InventoryPrefillGenerator {
    internal struct Request: Sendable {
        internal let source: InventoryPrefillSource
        internal let fieldIDs: [String]
    }

    internal let tokenBudget: Int
    private let answers: [[String: InventoryPrefillRawValue]]
    private let failures: Set<Int>
    private(set) var requests: [Request] = []

    internal init(
        tokenBudget: Int, answers: [[String: InventoryPrefillRawValue]] = [],
        failures: Set<Int> = []
    ) {
        self.tokenBudget = tokenBudget
        self.answers = answers
        self.failures = failures
    }

    internal func tokenCount(_ text: String) async -> Int {
        text.count
    }

    internal func generate(
        source: InventoryPrefillSource, fields: [InventoryCatalogueField]
    ) async throws -> [String: InventoryPrefillRawValue] {
        let index = requests.count
        requests.append(Request(source: source, fieldIDs: fields.map(\.id)))
        if failures.contains(index) { throw InventoryPrefillGeneratorFailure() }
        return answers.indices.contains(index) ? answers[index] : [:]
    }
}
