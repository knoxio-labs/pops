import AppCore

internal struct InventoryPrefillEngine: Sendable {
    private let generator: any InventoryPrefillGenerator

    internal init(generator: any InventoryPrefillGenerator) {
        self.generator = generator
    }

    internal func fill(
        source: InventoryPrefillSource, type: InventoryCatalogueType,
        draft: InventoryProtocol2Draft
    ) async -> [String: [InventoryPrimitiveValue]] {
        let fields = InventoryPrefillFieldPlan.fillable(fields: type.fields, draft: draft)
        guard !fields.isEmpty else { return [:] }

        let budget = await generator.tokenBudget
        let facts = await InventoryPrefillFacts.truncated(
            source: source, maximumTokens: budget / 2
        ) { [generator] text in
            await generator.tokenCount(text)
        }
        let chunks = await InventoryPrefillFieldPlan.make(
            fields: fields, draft: draft, budget: budget, factsCost: facts.cost
        ) { [generator] field in
            await generator.tokenCount(InventoryPrefillFieldPlan.renderedDescription(for: field))
        }

        var result: [String: [InventoryPrimitiveValue]] = [:]
        for chunk in chunks {
            do {
                let raw = try await generator.generate(source: facts.source, fields: chunk)
                let values = InventoryPrefillValidator.validate(raw, fields: chunk)
                result.merge(values, uniquingKeysWith: { _, new in new })
            } catch {
                continue
            }
        }
        return result
    }
}
