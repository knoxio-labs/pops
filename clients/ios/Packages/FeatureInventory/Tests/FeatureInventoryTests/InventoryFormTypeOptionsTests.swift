import AppCore
import Foundation
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

    @Test("the pushed type picker uses its caller's navigation stack")
    func typePickerLeavesNavigationOwnershipWithCaller() throws {
        let source = try pickerSource()

        #expect(!source.contains(".navigationDestination(for: String.self)"))
        #expect(!source.contains("NavigationStack"))
        #expect(!source.contains("NavigationPath"))
    }

    @Test("parent rows expand within the caller's stack")
    func parentRowsExpandInPlace() throws {
        let source = try pickerSource()

        #expect(source.contains("InventoryTypePickerTreeState"))
        #expect(source.contains("InventoryFormTypeTreeView"))
        #expect(!source.contains("NavigationLink {"))
    }

    @Test("selection commits after the picker begins dismissal")
    func selectionCommitsAfterDismissalBegins() throws {
        let source = try pickerSource()
        #expect(source.contains("if let onChoose"))
        #expect(source.contains("onChoose(id)"))
        #expect(source.contains("Button(\"Cancel\")"))
    }

    @Test("the picker keeps search, selection, accessibility and motion wiring")
    func pickerPresentationContract() throws {
        let picker = try pickerSource()
        let tree = try source("Form/InventoryFormTypeTreeView.swift")

        #expect(picker.contains(".searchable(text: $query"))
        #expect(picker.contains(".popsMotion(value: selection)"))
        #expect(tree.contains(".transition(.opacity)"))
        #expect(tree.contains(".popsMotion(value: tree.rows)"))
        #expect(tree.contains(".popsMotion(value: selection)"))
        #expect(tree.contains("checkmark.circle.fill"))
        #expect(
            tree.contains(".accessibilityAddTraits(selection == row.id ? .isSelected : [])"))
    }

    @Test("every semantic catalogue icon has a native symbol mapping")
    func catalogueIconMappingsAreComplete() {
        for token in InventoryCatalogueIconToken.allCases {
            #expect(!InventorySymbol.catalogue(token).system.isEmpty)
        }
        #expect(InventorySymbol.catalogue(.item).system == "cube")
    }

    @Test("form rows own picker dismissal so the item form stays presented")
    func formRowsOwnPickerDismissal() throws {
        let picker = try pickerSource()
        let rows = try formRowsSource()
        let protocol2Rows = try protocol2PickerSource()

        #expect(picker.contains("if let onChoose"))
        #expect(picker.contains("onChoose(id)"))
        #expect(rows.contains("@State private var pickerIsPresented = false"))
        #expect(rows.contains(".navigationDestination(isPresented: $pickerIsPresented)"))
        #expect(rows.contains("pickerIsPresented = false"))
        #expect(
            protocol2Rows.contains(".navigationDestination(isPresented: $pickerIsPresented)")
        )
        #expect(protocol2Rows.contains("pickerIsPresented = false"))
    }

    @Test("search \"pillowcase\" returns its path")
    func searchReturnsTypePath() {
        let results = InventoryFormTypeOptions.search(
            Self.catalogue, query: "pillowcase", selectedId: nil)

        #expect(results.map(\.path) == ["Bedding › Pillows › Pillowcase"])
    }

    @Test("protocol-2 options carry the catalogue icon into the native mapping")
    func protocol2OptionCarriesIcon() {
        let type = InventoryCatalogueType(
            id: "icon-type", key: "icon-type", label: "Icon type", sortOrder: 0,
            presentation: .object(["icon": .string("bedding")]))
        let catalogue = InventoryCatalogueSnapshot(
            revision: InventoryCatalogueRevision(revision: 1, minimumProtocol: 2), types: [type])

        let option = InventoryFormTypeOptions.protocol2All(catalogue, selectedId: nil).first

        #expect(option?.symbol.system == "bed.double")
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

    private func pickerSource() throws -> String {
        try source("Form/InventoryFormTypePicker.swift")
    }

    private func formRowsSource() throws -> String {
        try source("Form/InventoryItemFormRows.swift")
    }

    private func protocol2PickerSource() throws -> String {
        try source("Form/InventoryProtocol2TypePicker.swift")
    }

    private func source(_ relativePath: String) throws -> String {
        let packageRoot = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let file = packageRoot.appending(path: "Sources/FeatureInventory/\(relativePath)")
        return try String(contentsOf: file, encoding: .utf8)
    }
}
