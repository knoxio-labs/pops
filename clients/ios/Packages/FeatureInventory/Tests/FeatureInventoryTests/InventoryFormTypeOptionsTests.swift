import AppCore
import SwiftUI
import Testing

@testable import FeatureInventory

@Suite("Item form: the Type tree's options")
internal struct InventoryFormTypeOptionsTests {
    private static func type(
        _ id: String, label: String? = nil, parentTypeId: String? = nil,
        archived: Bool = false
    ) -> InventoryCatalogueType {
        InventoryCatalogueType(
            id: id, key: "key-\(id)", label: label ?? "Label \(id)", sortOrder: 0, fields: [],
            archivedAt: archived ? "2026-09-01" : nil, parentTypeId: parentTypeId)
    }

    private static let catalogue = InventoryCatalogueSnapshot(
        revision: InventoryCatalogueRevision(revision: 3, minimumProtocol: 2),
        types: [
            type("bedding", label: "Bedding"),
            type("pillows", label: "Pillows", parentTypeId: "bedding"),
            type("pillowcase", label: "Pillowcase", parentTypeId: "pillows"),
            type("gadget"), type("retired", archived: true),
            type("retired-child", label: "Retired child", parentTypeId: "gadget", archived: true),
            type("cable"),
        ])

    @Test("options form a tree")
    func optionsFormATree() {
        let options = InventoryFormTypeOptions.protocol2(Self.catalogue, selectedId: nil)

        #expect(options.map(\.id) == ["bedding", "cable", "gadget"])
        #expect(options.first?.hasChildren == true)
        #expect(
            InventoryFormTypeOptions.protocol2All(Self.catalogue, selectedId: nil)
                .first(where: { $0.id == "pillowcase" })?.parentID == "pillows")
        #expect(
            options.map(\.accessibilityIdentifier) == [
                "inventory-item-type-option-bedding",
                "inventory-item-type-option-cable", "inventory-item-type-option-gadget",
            ])
    }

    @Test("a parent drills into its children")
    func parentDrillsIntoChildren() {
        let children = InventoryFormTypeOptions.children(
            of: "bedding", in: Self.catalogue, selectedId: nil)

        #expect(children.map(\.id) == ["pillows"])
        #expect(children.first?.hasChildren == true)
        #expect(
            InventoryFormTypeOptions.children(
                of: "pillows", in: Self.catalogue, selectedId: nil
            ).map(\.label)
                == ["Pillowcase"])
    }

    @Test("Choose Pillows sets typeId to Pillows")
    @MainActor
    func chooseParentSetsTypeId() {
        var typeId: String?
        var navigationPath = NavigationPath()
        let selection = Binding<String?>(get: { typeId }, set: { typeId = $0 })

        InventoryFormTypePicker.choose(
            "pillows", selection: selection, navigationPath: &navigationPath)

        #expect(typeId == "pillows")
        #expect(navigationPath.isEmpty)
    }

    @Test("search \"pillowcase\" returns its path")
    func searchReturnsTypePath() {
        let results = InventoryFormTypeOptions.search(
            Self.catalogue, query: "pillowcase", selectedId: nil)

        #expect(results.map(\.path) == ["Bedding › Pillows › Pillowcase"])
    }

    @Test("an archived type stays listed only for the item already of it")
    func archivedTypeOnlyWhenSelected() {
        let editing = InventoryFormTypeOptions.protocol2All(Self.catalogue, selectedId: "retired")

        #expect(editing.contains(where: { $0.id == "retired" && $0.isArchived }))
        #expect(
            !InventoryFormTypeOptions.protocol2All(Self.catalogue, selectedId: nil)
                .contains(where: { $0.id == "retired" }))
    }

    @Test("a selected archived child remains reachable when it is the only child")
    func selectedArchivedChildRemainsReachable() {
        let roots = InventoryFormTypeOptions.protocol2(Self.catalogue, selectedId: "retired-child")

        #expect(roots.first(where: { $0.id == "gadget" })?.hasChildren == true)
        #expect(
            InventoryFormTypeOptions.children(
                of: "gadget", in: Self.catalogue, selectedId: "retired-child"
            ).map(\.id) == ["retired-child"])
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
