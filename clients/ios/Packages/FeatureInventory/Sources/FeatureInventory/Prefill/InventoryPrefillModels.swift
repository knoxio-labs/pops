import AppCore

internal struct InventoryPrefillFact: Hashable, Sendable {
    internal let label: String
    internal let value: String
}

internal enum InventoryPrefillSource: Hashable, Sendable {
    case product([InventoryPrefillFact])
    case text([String])
}

internal enum InventoryPrefillRawValue: Hashable, Sendable {
    case text(String)
    case texts([String])
    case flag(Bool)
    case flags([Bool])
}

internal protocol InventoryPrefillGenerator: Sendable {
    var tokenBudget: Int { get async }
    func tokenCount(_ text: String) async -> Int
    func generate(
        source: InventoryPrefillSource, fields: [InventoryCatalogueField]
    ) async throws -> [String: InventoryPrefillRawValue]
}

extension InventoryPrefillSource {
    var renderedFacts: String {
        switch self {
        case .product(let facts):
            return facts.map { "\($0.label): \($0.value)" }.joined(separator: "\n")
        case .text(let lines):
            return lines.joined(separator: "\n")
        }
    }

    func removingLastFact() -> InventoryPrefillSource? {
        switch self {
        case .product(let facts):
            guard !facts.isEmpty else { return nil }
            return .product(Array(facts.dropLast()))
        case .text(let lines):
            guard !lines.isEmpty else { return nil }
            return .text(Array(lines.dropLast()))
        }
    }
}

internal enum InventoryPrefillFacts {
    internal static func truncated(
        source: InventoryPrefillSource, maximumTokens: Int,
        tokenCount: @Sendable (String) async -> Int
    ) async -> (source: InventoryPrefillSource, cost: Int) {
        var source = source
        var cost = await tokenCount(source.renderedFacts)
        let maximumTokens = max(0, maximumTokens)

        while cost > maximumTokens, let shortened = source.removingLastFact() {
            source = shortened
            cost = await tokenCount(source.renderedFacts)
        }

        return (source, cost)
    }
}
