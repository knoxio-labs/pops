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

    @Test("every active type is offered alphabetically, each tapped by its pinned id")
    func activeTypesWithPinnedIdentifiers() {
        let options = InventoryFormTypeOptions.protocol2(Self.catalogue, selectedId: nil)

        #expect(options.map(\.id) == ["cable", "gadget"])
        #expect(options.map(\.label) == ["Label cable", "Label gadget"])
        #expect(
            options.map(\.accessibilityIdentifier) == [
                "inventory-item-type-option-cable", "inventory-item-type-option-gadget",
            ])
    }

    @Test("an archived type stays listed only for the item already of it")
    func archivedTypeOnlyWhenSelected() {
        let editing = InventoryFormTypeOptions.protocol2(Self.catalogue, selectedId: "retired")

        #expect(editing.map(\.id) == ["cable", "gadget", "retired"])
        #expect(editing[2].accessibilityIdentifier == "inventory-item-type-option-retired")
    }

    @Test("a protocol-1 catalogue's options are alphabetical and keyed by type key")
    func legacyTypesByKey() {
        let options = InventoryFormTypeOptions.legacy(
            [FormFixture.box, FormFixture.charger, FormFixture.cable])

        #expect(options.first?.id == "cable")
        #expect(options.first?.accessibilityIdentifier == "inventory-item-type-option-cable")
        #expect(options.map(\.id) == ["cable", "charger", "storage_box"])
        #expect(options.map(\.label) == ["Cable", "Charger", "Storage box"])
        #expect(
            options.map(\.accessibilityIdentifier)
                == [
                    "inventory-item-type-option-cable",
                    "inventory-item-type-option-charger",
                    "inventory-item-type-option-storage_box",
                ])
    }
}
