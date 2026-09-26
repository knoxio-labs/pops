import AppCore
import Testing

@testable import FeatureInventory

@Suite("Protocol 2 choice fields and hints in the item form")
internal struct InventoryProtocol2ChoiceTests {
    private static let late = InventoryCatalogueOption(
        id: "opt-late", key: "late", label: "Zinc", sortOrder: 5)
    private static let retired = InventoryCatalogueOption(
        id: "opt-retired", key: "retired", label: "Brass", sortOrder: 3,
        archivedAt: "2026-09-01")
    private static let early = InventoryCatalogueOption(
        id: "opt-early", key: "early", label: "Aluminium", sortOrder: 1)

    private static func field(
        options: [InventoryCatalogueOption] = [late, retired, early], help: String? = nil,
        kind: InventoryPrimitiveKind = .enumeration
    ) -> InventoryCatalogueField {
        InventoryCatalogueField(
            id: "finish", typeId: "type", key: "finish", label: "Finish", help: help,
            sortOrder: 0, kind: kind, cardinality: .one, required: false, storage: .stored,
            enumOptions: options)
    }

    @Test("the pushed list offers the catalogue's order, by option id, never a retired option")
    func listFollowsCatalogueOrder() {
        let choices = InventoryProtocol2EnumOptions.choices(for: Self.field(), retaining: nil)

        #expect(choices.map(\.id) == ["opt-early", "opt-late"])
        #expect(choices.map(\.label) == ["Aluminium", "Zinc"])
    }

    @Test("a value already holding a retired option keeps it, in place and marked")
    func retiredValueStaysReadable() {
        let choices = InventoryProtocol2EnumOptions.choices(
            for: Self.field(), retaining: "opt-retired")

        #expect(choices.map(\.id) == ["opt-early", "opt-retired", "opt-late"])
        #expect(choices.map(\.label) == ["Aluminium", "Brass (Retired)", "Zinc"])
        #expect(
            InventoryProtocol2Display.text(
                for: [.enumeration(optionId: "opt-retired")], field: Self.field(),
                referenceLabel: { _ in nil }) == "Brass (Retired)")
    }

    @Test("an equal sort order falls back to the option id, so the order never flickers")
    func tiesBreakOnId() {
        let second = InventoryCatalogueOption(id: "b", key: "b", label: "Second", sortOrder: 0)
        let first = InventoryCatalogueOption(id: "a", key: "a", label: "First", sortOrder: 0)
        let choices = InventoryProtocol2EnumOptions.choices(
            for: Self.field(options: [second, first]), retaining: nil)

        #expect(choices.map(\.id) == ["a", "b"])
    }

    @Test("searching a list matches the words shown, not the ids behind them")
    func searchMatchesLabels() {
        let choices = InventoryProtocol2EnumOptions.choices(for: Self.field(), retaining: nil)

        #expect(InventoryFormChoices.matching(choices, query: "zin").map(\.id) == ["opt-late"])
        #expect(InventoryFormChoices.matching(choices, query: "opt").isEmpty)
        #expect(InventoryFormChoices.matching(choices, query: "  ").map(\.id) == choices.map(\.id))
    }

    @Test("only a list longer than the threshold is searchable")
    func searchableThreshold() {
        let atThreshold = (0..<InventoryFormChoices.searchableThreshold).map {
            InventoryFormChoiceOption(id: "\($0)", label: "Option \($0)")
        }
        #expect(!InventoryFormChoices.isSearchable(atThreshold))
        #expect(
            InventoryFormChoices.isSearchable(
                atThreshold + [InventoryFormChoiceOption(id: "x", label: "One more")]))
    }

    @Test("a field's help is what its empty editor shows; without help it is blank")
    func helpIsThePlaceholder() {
        #expect(
            InventoryProtocol2FieldHint.placeholder(
                for: Self.field(help: "Width in mm", kind: .measurement)) == "Width in mm")
        #expect(
            InventoryProtocol2FieldHint.placeholder(for: Self.field(kind: .measurement))
                .isEmpty)
    }
}
