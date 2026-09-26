import AppCore

internal enum InventoryPrefillFieldPlan {
    internal static func fillable(
        fields: [InventoryCatalogueField], draft: InventoryProtocol2Draft
    ) -> [InventoryCatalogueField] {
        fields.filter { field in
            field.storage == .stored
                && field.archivedAt == nil
                && field.kind != .reference
                && draft.isEmpty(field)
                && (field.kind != .enumeration || hasActiveOption(field))
                && (field.kind != .measurement || field.fixedUnit != nil)
        }
    }

    internal static func make(
        fields: [InventoryCatalogueField], draft: InventoryProtocol2Draft, budget: Int,
        factsCost: Int,
        cost: @Sendable (InventoryCatalogueField) async -> Int
    ) async -> [[InventoryCatalogueField]] {
        let capacity = budget - factsCost
        guard capacity >= 0 else { return [] }

        var chunks: [[InventoryCatalogueField]] = []
        var current: [InventoryCatalogueField] = []
        var currentCost = 0

        for field in fillable(fields: fields, draft: draft).sorted(by: sortOrder) {
            let fieldCost = max(0, await cost(field))
            guard fieldCost <= capacity else { continue }

            if currentCost + fieldCost > capacity, !current.isEmpty {
                chunks.append(current)
                current = []
                currentCost = 0
            }

            current.append(field)
            currentCost += fieldCost
        }

        if !current.isEmpty { chunks.append(current) }
        return chunks
    }

    internal static func renderedDescription(for field: InventoryCatalogueField) -> String {
        var parts = [field.label]
        if let help = field.help, !help.isEmpty { parts.append(help) }
        parts.append(
            contentsOf: field.enumOptions
                .filter { $0.archivedAt == nil }
                .sorted { ($0.sortOrder, $0.id) < ($1.sortOrder, $1.id) }
                .map(\.label))
        return parts.joined(separator: "\n")
    }

    private static func hasActiveOption(_ field: InventoryCatalogueField) -> Bool {
        field.enumOptions.contains { $0.archivedAt == nil }
    }

    private static func sortOrder(
        _ lhs: InventoryCatalogueField, _ rhs: InventoryCatalogueField
    ) -> Bool {
        (lhs.sortOrder, lhs.id) < (rhs.sortOrder, rhs.id)
    }
}
