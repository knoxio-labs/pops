import AppCore
import Testing

@testable import FeatureInventory

@Suite("Item form: the Type menu's options")
internal struct InventoryFormTypeOptionsTests {
    private static func type(_ id: String, archived: Bool = false) -> InventoryCatalogueType {
        InventoryCatalogueType(
            id: id, key: "key-\(id)", label: "Label \(id)", sortOrder: 0, fields: [],
            archivedAt: archived ? "2026-09-01" : nil)
    }

    private static let catalogue = InventoryCatalogueSnapshot(
        revision: InventoryCatalogueRevision(revision: 3, minimumProtocol: 2),
        types: [type("gadget"), type("retired", archived: true), type("cable")])

    @Test("every active type is offered in catalogue order, each tapped by its pinned id")
    func activeTypesWithPinnedIdentifiers() {
        let options = InventoryFormTypeOptions.protocol2(Self.catalogue, selectedId: "gadget")

        #expect(options.map(\.id) == ["gadget", "cable"])
        #expect(options.map(\.label) == ["Label gadget", "Label cable"])
        #expect(
            options.map(\.accessibilityIdentifier) == [
                "inventory-item-type-option-gadget", "inventory-item-type-option-cable",
            ])
    }

    @Test("an archived type stays listed only for the item already of it")
    func archivedTypeOnlyWhenSelected() {
        let editing = InventoryFormTypeOptions.protocol2(Self.catalogue, selectedId: "retired")

        #expect(editing.map(\.id) == ["gadget", "retired", "cable"])
        #expect(editing[1].accessibilityIdentifier == "inventory-item-type-option-retired")
    }

    @Test("a protocol-1 catalogue's options are keyed by type key")
    func legacyTypesByKey() {
        let options = InventoryFormTypeOptions.legacy(FormFixture.catalogue.types)

        #expect(options.first?.id == "cable")
        #expect(options.first?.accessibilityIdentifier == "inventory-item-type-option-cable")
        #expect(options.map(\.id) == FormFixture.catalogue.types.map(\.key))
        #expect(options.map(\.label) == FormFixture.catalogue.types.map(\.name))
        #expect(
            options.map(\.accessibilityIdentifier)
                == FormFixture.catalogue.types.map { "inventory-item-type-option-\($0.key)" })
    }
}
