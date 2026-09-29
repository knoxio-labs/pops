import Foundation
import Testing

@testable import DesignPlayground

@Suite("Inventory type tree")
@MainActor
internal struct InventoryTypeTreeTests {
    @Test("the fixture tree keeps the approved nested paths and archived child")
    func fixtureTreeKeepsApprovedPaths() {
        #expect(
            InventoryFormType.path(for: "Pillowcase")
                == "Pillows & cushions › Pillows › Pillowcase"
        )
        #expect(
            InventoryFormType.children(of: "pillows").map(\.name)
                == ["Pillow", "Pillowcase", "Pillow protector"]
        )
        #expect(InventoryFormType.node(withID: "pillow-protector")?.isArchived == true)
    }

    @Test("search flattens a nested type to its full path")
    func searchFlattensToPaths() {
        let matches = InventoryFormType.searchOptions(query: "pillowcase")

        #expect(matches.map(\.path) == ["Pillows & cushions › Pillows › Pillowcase"])
    }

    @Test("a subtype template includes inherited fields in field order")
    func subtypeTemplateIncludesInheritedFields() {
        let fields = InventoryFormType.named("Pillowcase")?.fields.map(\.key)

        #expect(
            fields
                == ["Destination", "Material", "Colour", "Pattern", "Pillow size", "Closure"]
        )
    }

    @Test("detail highlights fields inherited by a tree type")
    func detailHighlightsTreeTypeFields() {
        let detail = InventoryItemDetail(
            item: InventoryFoundationItem(
                id: "pillowcase", name: "Linen pillowcase", typeName: "Pillowcase",
                placement: .direct(location: "Guest room")),
            fields: [
                InventoryDetailField(key: "Destination", value: "Guest room"),
                InventoryDetailField(key: "Material", value: "Cotton"),
                InventoryDetailField(key: "Closure", value: "Envelope"),
            ])

        #expect(detail.highlightedFields.map(\.key) == ["Destination"])
        #expect(detail.otherFields.map(\.key) == ["Material", "Closure"])
    }

    @Test("a parent type filter includes its descendants")
    func parentFilterIncludesDescendants() {
        let pillowcase = InventorySearchRecord(
            item: InventoryFoundationItem(
                id: "pillowcase", name: "Linen pillowcase", typeName: "Pillowcase",
                placement: .inHand(previous: nil)))

        #expect(InventorySearchFilter(typeName: "Pillows & cushions").matches(pillowcase))
        #expect(InventorySearchFilter(typeName: "Pillows").matches(pillowcase))
        #expect(!InventorySearchFilter(typeName: "Bedding").matches(pillowcase))
    }

    @Test("the registered change state leaves only Fitted out")
    func typeChangeStateNamesNotCarriedValue() {
        let state = InventoryItemFormCase.all.first { $0.id == "type-change-in-tree" }

        #expect(state?.draft.typeName == "Quilt cover")
        #expect(state?.notCarried.map(\.field) == ["Fitted"])
        #expect(state?.notCarried.first?.fit.blocks == true)
    }

    @Test("the subtype detail subtitle is the full path")
    func subtypeDetailSubtitleUsesPath() {
        #expect(
            InventoryFormType.detailSubtitle(typeName: "Pillowcase", quantity: 1)
                == "Pillows & cushions › Pillows › Pillowcase"
        )
    }

    @Test("the form type picker keeps its no-type option")
    func formTypePickerKeepsNoneOption() throws {
        let picker = try source(
            at:
                "Sources/DesignPlayground/Surfaces/Inventory/Creation/InventoryFormTypePicker.swift"
        )

        #expect(picker.contains("showsNoneOption: Bool = true"))
        #expect(picker.contains("if showsNoneOption"))
        #expect(picker.contains("InventoryFormType.none"))
    }

    @Test("the search filter offers Any to clear the type")
    func searchFilterOffersAnyTypeOption() throws {
        let filterSheet = try source(
            at:
                "Sources/DesignPlayground/Surfaces/Inventory/Search/InventorySearchFilterSheet.swift"
        )

        #expect(filterSheet.contains("showsNoneOption: true"))
        #expect(filterSheet.contains("noneOptionTitle: \"Any\""))
    }

    @Test("the ticket states are registered on their required surfaces")
    func ticketStatesAreRegistered() {
        let formIDs = Set(InventoryItemFormCase.all.map(\.id))
        let searchIDs = Set(InventorySearchSurfaces.items.states.map(\.id))
        let detailIDs = Set(InventoryItemDetailSurfaces.detail.states.map(\.id))

        #expect(formIDs.isSuperset(of: ["type-tree", "type-tree-search", "type-parent-chosen"]))
        #expect(formIDs.contains("type-change-in-tree"))
        #expect(searchIDs.contains("type-filter-tree"))
        #expect(detailIDs.contains("subtype-detail"))
    }

    @Test("the pushed type picker uses its caller's navigation stack")
    func typePickerLeavesNavigationOwnershipWithCaller() throws {
        let source = try pickerSource()

        #expect(source.contains(".navigationDestination(for: String.self)"))
        #expect(!source.contains("NavigationStack"))
        #expect(!source.contains("NavigationPath"))
    }

    private func pickerSource() throws -> String {
        try source(
            at:
                "Sources/DesignPlayground/Surfaces/Inventory/Creation/InventoryFormTypePicker.swift"
        )
    }

    private func source(at relativePath: String) throws -> String {
        let packageRoot = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let file = packageRoot.appending(path: relativePath)
        return try String(contentsOf: file, encoding: .utf8)
    }
}
