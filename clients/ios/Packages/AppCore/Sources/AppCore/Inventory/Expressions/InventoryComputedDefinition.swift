import Foundation

/// An explicit value that supersedes a computed field, and the catalogue
/// revision it was written against.
public struct InventoryComputedOverride: Hashable, Sendable {
    public let value: InventoryPrimitiveValue
    public let catalogueRevision: Int

    public init(value: InventoryPrimitiveValue, catalogueRevision: Int) {
        self.value = value
        self.catalogueRevision = catalogueRevision
    }
}

/// One computed field of a catalogue revision, parsed and ready to evaluate
/// on the phone exactly as the server does (Inventory ADR-002 D11).
public struct InventoryComputedDefinition: Hashable, Sendable {
    public let fieldId: String
    public let kind: InventoryPrimitiveKind
    public let fixedUnit: String?
    public let allowOverride: Bool
    public let expression: InventoryExpression
    /// The stored expression version, which decides how measurements combine
    /// and decimals compare.
    public let expressionVersion: Int
    /// Every catalogue field's declared kind by id, which types a version-2
    /// `equal` on a read; a field missing here compares by spelling.
    public let fieldKinds: [String: InventoryPrimitiveKind]

    public init(
        fieldId: String, kind: InventoryPrimitiveKind, fixedUnit: String?, allowOverride: Bool,
        expression: InventoryExpression, expressionVersion: Int,
        fieldKinds: [String: InventoryPrimitiveKind]
    ) {
        self.fieldId = fieldId
        self.kind = kind
        self.fixedUnit = fixedUnit
        self.allowOverride = allowOverride
        self.expression = expression
        self.expressionVersion = expressionVersion
        self.fieldKinds = fieldKinds
    }

    /// Parses a catalogue field's expression, typing its reads by
    /// `fieldKinds` (every field of the same catalogue revision). Throws when
    /// the field is not computed, or its expression uses syntax this build
    /// does not know; the caller then cannot evaluate it and keeps whatever
    /// the server sent.
    public init(_ field: InventoryCatalogueField, fieldKinds: [String: InventoryPrimitiveKind])
        throws(InventoryExpressionRejection)
    {
        guard field.storage == .computed, let version = field.expressionVersion,
            let json = field.expression
        else {
            throw InventoryExpressionRejection(code: "computed_expression_required", path: field.id)
        }
        self.init(
            fieldId: field.id, kind: field.kind, fixedUnit: field.fixedUnit,
            allowOverride: field.allowOverride,
            expression: try InventoryExpression.parse(version: version, json: json),
            expressionVersion: version, fieldKinds: fieldKinds)
    }

    /// `evaluateComputedValue` plus the sync projection: an override wins
    /// without evaluating; an evaluation failure is `evaluation_error` on this
    /// field with only the root traversed; a value reports the root and every
    /// item a dependency names as traversed.
    ///
    /// - Throws: `override_forbidden` when `override` is set on a field that
    ///   does not allow one, as the server refuses it.
    public func evaluate(
        override: InventoryComputedOverride?, catalogueRevision: Int, itemRevision: Int,
        in snapshot: any InventoryExpressionSnapshot
    ) throws(InventoryExpressionRejection) -> InventoryComputedValue {
        if let override {
            guard allowOverride else {
                throw InventoryExpressionRejection(code: "override_forbidden", path: fieldId)
            }
            return value(
                .overridden(override.value, overrideCatalogueRevision: override.catalogueRevision),
                catalogueRevision: catalogueRevision, itemRevision: itemRevision, dependencies: [],
                traversed: [])
        }
        let root = snapshot.rootItemId
        switch InventoryExpressionEvaluator.evaluate(self, in: snapshot) {
        case .value(let result, let dependencies):
            var traversed: [String] = []
            for itemId in [root] + dependencies.map(\.itemId) where !traversed.contains(itemId) {
                traversed.append(itemId)
            }
            return value(
                .ok(result), catalogueRevision: catalogueRevision, itemRevision: itemRevision,
                dependencies: dependencies, traversed: traversed)
        case .unavailable(let unavailable, let dependencies):
            return value(
                .unavailable(
                    reason: unavailable.reason.rawValue, failedFieldId: unavailable.failedFieldId),
                catalogueRevision: catalogueRevision, itemRevision: itemRevision,
                dependencies: dependencies,
                traversed: unavailable.traversedItemIds, missingInputs: unavailable.missingInputs)
        case .error(_, let dependencies):
            return value(
                .unavailable(
                    reason: InventoryValueUnavailableReason.evaluationError.rawValue,
                    failedFieldId: fieldId),
                catalogueRevision: catalogueRevision, itemRevision: itemRevision,
                dependencies: dependencies,
                traversed: [root])
        }
    }

    private func value(
        _ evaluation: InventoryComputedEvaluation, catalogueRevision: Int, itemRevision: Int,
        dependencies: [InventoryValueDependency], traversed: [String],
        missingInputs: [InventoryExpressionMissingInput] = []
    ) -> InventoryComputedValue {
        InventoryComputedValue(
            fieldId: fieldId, catalogueRevision: catalogueRevision, evaluation: evaluation,
            dependencies: dependencies, traversedItemIds: traversed,
            evaluatedItemRevision: itemRevision, missingInputs: missingInputs)
    }
}

extension InventoryCatalogueSnapshot {
    /// Every field's declared kind by id, which ``InventoryComputedDefinition``
    /// types a version-2 `equal` on a read by. Field ids are unique within a
    /// catalogue revision.
    public var fieldKinds: [String: InventoryPrimitiveKind] {
        Dictionary(
            types.flatMap(\.fields).map { ($0.id, $0.kind) },
            uniquingKeysWith: { first, _ in first })
    }
}
