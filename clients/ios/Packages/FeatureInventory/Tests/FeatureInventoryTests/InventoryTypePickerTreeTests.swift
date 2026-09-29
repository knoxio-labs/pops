import Testing

@testable import FeatureInventory

@MainActor
@Suite("Inventory type picker tree")
internal struct InventoryTypePickerTreeTests {
    private static func option(
        _ id: String, label: String, parent: String? = nil, children: Bool = false
    ) -> InventoryFormTypeOption {
        InventoryFormTypeOption(
            id: id, label: label, parentID: parent, path: label,
            hasChildren: children)
    }

    @Test("initial expansion exposes at least five rows and later collapse stays closed")
    func initialExpansionAndCollapse() {
        let options = [
            Self.option("one", label: "One", children: true),
            Self.option("one-a", label: "One A", parent: "one"),
            Self.option("one-b", label: "One B", parent: "one"),
            Self.option("two", label: "Two", children: true),
            Self.option("two-a", label: "Two A", parent: "two"),
            Self.option("three", label: "Three"),
        ]
        let tree = InventoryTypePickerTreeState(options: options, selectedID: nil)

        #expect(tree.rows.count >= 5)
        #expect(tree.rows.contains { $0.id == "one-a" })
        tree.toggle("one")
        #expect(!tree.rows.contains { $0.id == "one-a" })
    }

    @Test("two root branches both open when the catalogue has only two roots")
    func twoRootsOpenTogether() {
        let options = [
            Self.option("cover", label: "Cushion cover", children: true),
            Self.option("cover-a", label: "Cover A", parent: "cover"),
            Self.option("cover-b", label: "Cover B", parent: "cover"),
            Self.option("cover-c", label: "Cover C", parent: "cover"),
            Self.option("cushion", label: "Cushion", children: true),
            Self.option("cushion-a", label: "Cushion A", parent: "cushion"),
            Self.option("cushion-b", label: "Cushion B", parent: "cushion"),
            Self.option("cushion-c", label: "Cushion C", parent: "cushion"),
        ]
        let tree = InventoryTypePickerTreeState(options: options, selectedID: nil)

        #expect(tree.rows.contains { $0.id == "cover-a" })
        #expect(tree.rows.contains { $0.id == "cushion-a" })
        #expect(tree.rows.first { $0.id == "cover" }?.isExpanded == true)
        #expect(tree.rows.first { $0.id == "cushion" }?.isExpanded == true)
    }

    @Test("selected ancestors open without moving focus")
    func selectedPath() {
        let options = [
            Self.option("root", label: "Root", children: true),
            Self.option("branch", label: "Branch", parent: "root", children: true),
            Self.option("leaf", label: "Leaf", parent: "branch"),
        ]
        let tree = InventoryTypePickerTreeState(options: options, selectedID: "leaf")

        #expect(tree.focusID == nil)
        #expect(tree.rows.map(\.id) == ["root", "branch", "leaf"])
        #expect(tree.rows.last?.isExpanded == false)
    }

    @Test("focus narrows the tree and the ancestor menu widens it")
    func focusAndWiden() {
        let options = [
            Self.option("root", label: "Root", children: true),
            Self.option("branch", label: "Branch", parent: "root", children: true),
            Self.option("leaf", label: "Leaf", parent: "branch"),
        ]
        let tree = InventoryTypePickerTreeState(options: options, selectedID: nil)

        tree.focus("branch")
        #expect(tree.focusID == "branch")
        #expect(tree.rows.map(\.id) == ["leaf"])
        tree.goTo(nil)
        #expect(tree.focusID == nil)
        #expect(tree.rows.contains { $0.id == "root" })
    }

    @Test("missing parents and cycles do not make rows unreachable or recurse forever")
    func defensiveTree() {
        let options = [
            Self.option("orphan", label: "Orphan", parent: "missing"),
            Self.option("a", label: "A", parent: "b", children: true),
            Self.option("b", label: "B", parent: "a", children: true),
        ]
        let tree = InventoryTypePickerTreeState(options: options, selectedID: nil)

        #expect(tree.rows.contains { $0.id == "orphan" })
        tree.focus("a")
        #expect(tree.rows.map(\.id) == ["b"])
    }
}
