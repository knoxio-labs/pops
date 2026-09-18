import Testing

@testable import DesignPlayground

#if canImport(UIKit)
    import UIKit
#endif

/// POPS-3985's hierarchy logic: what a place holds directly versus through
/// what is below it, and the one-line effects its operations state.
@Suite("Inventory location hierarchy")
internal struct InventoryLocationHierarchyTests {
    private typealias Fixtures = InventoryLocationFixtures

    private static let shelf = InventoryLocationTree(nodes: [
        InventoryLocationNode(id: "home", name: "Home", kind: .home),
        InventoryLocationNode(
            id: "garage", name: "Garage", parentID: "home",
            items: [InventoryPlacedEntry(id: "drill", name: "Drill", typeName: "Tool")],
            containers: [
                InventoryPlacedContainer(
                    id: "crate", name: "Crate",
                    contents: [
                        InventoryPlacedEntry(id: "hose", name: "Hose", typeName: "Garden"),
                        InventoryPlacedEntry(id: "rake", name: "Rake", typeName: "Garden"),
                    ])
            ]),
        InventoryLocationNode(
            id: "tools", name: "Tool shelf", kind: .shelf, parentID: "garage",
            items: [InventoryPlacedEntry(id: "saw", name: "Saw", typeName: "Tool")]),
        InventoryLocationNode(id: "loft", name: "Loft", parentID: "home"),
    ])

    #if canImport(UIKit)
        private func exists(_ name: String) -> Bool {
            UIImage(systemName: name) != nil
        }
    #endif

    @Test("a tally counts places below, containers, and items directly and inside containers")
    func tallyFollowsTheWholeSubtree() {
        let tally = Self.shelf.tally(of: "garage")
        #expect(tally == InventoryPlaceTally(places: 1, containers: 1, items: 4))
        #expect(
            Self.shelf.tally(of: "home") == InventoryPlaceTally(places: 3, containers: 1, items: 4))
    }

    @Test("a leaf's tally is only what sits in it")
    func leafTallyIsItsOwn() {
        #expect(Self.shelf.tally(of: "tools") == InventoryPlaceTally(items: 1))
        #expect(Self.shelf.tally(of: "loft").isEmpty)
    }

    @Test("an unknown place has an empty tally rather than crashing")
    func unknownPlaceHasNothing() {
        #expect(Self.shelf.tally(of: "attic").isEmpty)
        #expect(Self.shelf.breadcrumbs(for: "attic").isEmpty)
        #expect(Self.shelf.deletionEffect(of: "attic").isEmpty)
    }

    @Test("direct counts leave out what is inside containers")
    func directCountsAreDirect() throws {
        let garage = try #require(Self.shelf.node("garage"))
        #expect(garage.directItemCount == 1)
        #expect(garage.directContainerCount == 1)
        #expect(garage.containedItemCount == 2)
    }

    @Test("the whole tree's total counts every place once")
    func totalCountsEveryPlace() {
        #expect(Self.shelf.total == InventoryPlaceTally(places: 4, containers: 1, items: 4))
    }

    @Test("breadcrumbs run root first and end at the place itself")
    func breadcrumbsRunFromRootToTarget() {
        #expect(
            Self.shelf.breadcrumbs(for: "tools").map(\.name) == ["Home", "Garage", "Tool shelf"])
        #expect(Self.shelf.parentPath(of: "tools") == "Home › Garage")
        #expect(Self.shelf.parentPath(of: "home").isEmpty)
    }

    @Test("a parent cycle in the data ends the breadcrumb instead of looping forever")
    func breadcrumbsSurviveACycle() {
        let looped = InventoryLocationTree(nodes: [
            InventoryLocationNode(id: "a", name: "A", parentID: "b"),
            InventoryLocationNode(id: "b", name: "B", parentID: "a"),
        ])
        #expect(looped.breadcrumbs(for: "a").map(\.id) == ["b", "a"])
    }

    @Test("a reparent is never offered the place itself or anything below it")
    func reparentTargetsExcludeTheSubtree() {
        let targets = Self.shelf.reparentTargets(for: "garage")
        #expect(targets == ["home", "loft"])
        #expect(Self.shelf.isDescendant("tools", of: "garage"))
        #expect(!Self.shelf.isDescendant("loft", of: "garage"))
    }

    @Test("search matches any part of a name, ignoring case, in tree order")
    func searchMatchesInTreeOrder() {
        #expect(Self.shelf.matching("O").map(\.id) == ["home", "tools", "loft"])
        #expect(Self.shelf.matching("  ").isEmpty)
        #expect(Self.shelf.matching("attic").isEmpty)
    }

    @Test("deleting says what moves and where, counting a container's contents with it")
    func deletionEffectNamesTheParent() {
        #expect(
            Self.shelf.deletionEffect(of: "garage")
                == "1 place, 1 container and 3 items move to Home.")
        #expect(Self.shelf.deletionEffect(of: "tools") == "1 item moves to Garage.")
    }

    @Test("deleting an empty place says only it goes; deleting a root says things lose a place")
    func deletionEffectEdgeCases() {
        #expect(Self.shelf.deletionEffect(of: "loft") == "Only Loft is removed.")
        #expect(Self.shelf.deletionEffect(of: "home") == "2 places lose their place.")
    }

    @Test("the fixture's pantry shelf reads as the ticket's example")
    func pantryShelfEffect() {
        #expect(
            Fixtures.home.deletionEffect(of: "pantry-shelf") == "12 items move to Kitchen.")
    }

    @Test("a move says what goes with the place")
    func moveEffect() {
        #expect(Self.shelf.moveEffect(of: "tools", to: "loft") == "Tool shelf moves into Loft.")
        #expect(
            Self.shelf.moveEffect(of: "garage", to: "loft")
                == "Garage and 1 place move into Loft.")
        #expect(Self.shelf.moveEffect(of: "garage", to: "attic").isEmpty)
    }

    @Test("a tally's summary leaves out zeros and pluralises")
    func tallySummary() {
        #expect(InventoryPlaceTally(places: 1, items: 2).summary == "1 place · 2 items")
        #expect(InventoryPlaceTally().summary.isEmpty)
        #expect(InventoryPlaceTally(containers: 2).phrase == "2 containers")
    }

    @Test("roots of any kind are top level, none of them special")
    func rootsOfAnyKind() {
        let kinds = Fixtures.home.roots.map(\.kind)
        #expect(kinds == [.home, .vehicle, .storage, .elsewhere])
    }

    @Test("the picker offers a destination's items in all, and its path as detail")
    func destinationFromPlace() throws {
        let pantry = try #require(Fixtures.home.node("pantry-shelf"))
        let destination = InventoryDestination(place: pantry, in: Fixtures.home)
        #expect(destination.detail == "Home › Kitchen")
        #expect(destination.count == 12)
        #expect(destination.symbol == InventoryPlaceKind.shelf.symbol)
    }

    #if canImport(UIKit)
        @Test("every glyph a place kind or a fixture names exists")
        func glyphsResolve() {
            let names =
                InventoryPlaceKind.allCases.map(\.symbol)
                + Fixtures.home.nodes.flatMap { node in
                    node.items.map(\.symbol) + node.containers.flatMap { $0.contents.map(\.symbol) }
                }
            let missing = names.filter { !exists($0) }
            #expect(missing.isEmpty, "not in the SF Symbols catalogue: \(missing)")
            #expect(!exists("inventory.not-a-real-symbol"))
        }
    #endif
}
