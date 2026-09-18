import Testing

@testable import DesignPlayground

private func item(
    _ id: String, quantity: Int = 1, access: InventoryAccess? = nil,
    lifecycle: InventoryLifecycle = .active,
    placement: InventoryPlacement = .direct(location: "Garage")
) -> InventoryFoundationItem {
    InventoryFoundationItem(
        id: id, name: id, typeName: "Thing", quantity: quantity, placement: placement,
        access: access, lifecycle: lifecycle)
}

private func profile(
    access: InventoryAccess? = .open, lifecycle: InventoryLifecycle = .active,
    isFull: Bool = false, isFurniture: Bool = false,
    placement: InventoryPlacement = .direct(location: "Garage")
) -> InventoryContainerProfile {
    InventoryContainerProfile(
        detail: InventoryItemDetail(
            item: item("box", access: access, lifecycle: lifecycle, placement: placement)),
        isFull: isFull, isFurniture: isFurniture)
}

private func entries(_ count: Int) -> InventoryContainerContents {
    InventoryContainerContents(
        entries: (0..<count).map { InventoryContainedEntry(item: item("i\($0)"), added: "Today") })
}

/// What a container's contents count to, and when they become searchable.
@Suite("Inventory container contents")
internal struct InventoryContainerContentsTests {
    @Test("item count and unit count diverge once a quantity is more than one")
    func countsDiverge() {
        let contents = InventoryContainerContents(entries: [
            InventoryContainedEntry(item: item("screws", quantity: 120), added: "Today"),
            InventoryContainedEntry(item: item("cable"), added: "Today"),
        ])

        #expect(contents.itemCount == 2)
        #expect(contents.unitCount == 121)
        #expect(contents.summary == "2 items · 121 units")
        #expect(InventoryContainerContents(entries: [contents.entries[1]]).summary == "1 item")
    }

    @Test("the summary drops units when every entry is one")
    func summaryWithoutGroups() {
        #expect(entries(3).summary == "3 items")
    }

    @Test("an exhausted quantity contributes nothing negative to the unit total")
    func exhaustedQuantityFloorsAtZero() {
        let contents = InventoryContainerContents(entries: [
            InventoryContainedEntry(item: item("tape", quantity: 0), added: "Today")
        ])

        #expect(contents.unitCount == 0)
    }

    @Test("searching matches by name, keeps order, and is empty-query safe")
    func searchMatchesByName() {
        let contents = InventoryContainerContents(entries: [
            InventoryContainedEntry(item: item("espresso-machine"), added: "Now"),
            InventoryContainedEntry(item: item("cable"), added: "Today"),
            InventoryContainedEntry(item: item("Espresso cups"), added: "Yesterday"),
        ])

        #expect(contents.matching("  ").count == 3)
        #expect(contents.matching("ESPRESSO").map(\.id) == ["espresso-machine", "Espresso cups"])
        #expect(contents.matching("nothing-like-this").isEmpty)
    }

    private var typed: InventoryContainerContents {
        func entry(_ id: String, _ type: String?, recent: Bool) -> InventoryContainedEntry {
            InventoryContainedEntry(
                item: InventoryFoundationItem(
                    id: id, name: id, typeName: type, placement: .direct(location: "Study")),
                added: "Today", isRecent: recent)
        }
        return InventoryContainerContents(entries: [
            entry("hdmi cable", "Cable", recent: true),
            entry("pens", "Stationery", recent: true),
            entry("usb cable", "Cable", recent: false),
            entry("mystery", nil, recent: false),
        ])
    }

    @Test("the filter offers each present type once, sorted, and skips untyped entries")
    func filterTypes() {
        #expect(typed.types == ["Cable", "Stationery"])
        #expect(InventoryContainerContents().types.isEmpty)
    }

    @Test("a type filter keeps only that type and combines with the search text")
    func typeFilter() {
        let cables = InventoryContainerContentsFilter(type: "Cable")

        #expect(typed.matching("", filter: cables).map(\.id) == ["hdmi cable", "usb cable"])
        #expect(typed.matching("usb", filter: cables).map(\.id) == ["usb cable"])
        #expect(typed.matching("pens", filter: cables).isEmpty)
    }

    @Test("recently added keeps only recent entries, and stacks with a type")
    func recentFilter() {
        let recent = InventoryContainerContentsFilter(recentOnly: true)
        let recentCables = InventoryContainerContentsFilter(type: "Cable", recentOnly: true)

        #expect(typed.matching("", filter: recent).map(\.id) == ["hdmi cable", "pens"])
        #expect(typed.matching("", filter: recentCables).map(\.id) == ["hdmi cable"])
    }

    @Test("the filter reads as active only when it narrows something")
    func filterActivity() {
        #expect(!InventoryContainerContentsFilter().isActive)
        #expect(InventoryContainerContentsFilter(type: "Cable").isActive)
        #expect(InventoryContainerContentsFilter(recentOnly: true).isActive)
        #expect(typed.matching("", filter: InventoryContainerContentsFilter()).count == 4)
    }
}

/// The verbs a container's page offers.
@Suite("Inventory container actions")
internal struct InventoryContainerActionsTests {
    private func ids(_ profile: InventoryContainerProfile) -> [String] {
        InventoryContainerActions.row(for: profile).map(\.id)
    }

    @Test("an open container offers pick up, move, close and store here, in that order")
    func openRow() {
        #expect(ids(profile()) == ["pick-up", "move", "close", "store-here"])
        #expect(
            InventoryContainerActions.row(for: profile()).first { $0.id == "close" }?.symbol
                == .close)
    }

    @Test("a closed container still offers store here, and opens without a seal")
    func closedRow() {
        let row = InventoryContainerActions.row(for: profile(access: .closed))

        #expect(row.map(\.id) == ["pick-up", "move", "reopen", "store-here"])
        #expect(row.allSatisfy { $0.confirmation == nil })
        #expect(row.first { $0.id == "reopen" }?.symbol == .open)
    }

    @Test("furniture is moved and stored into, never picked up, opened or closed")
    func furnitureRow() {
        #expect(ids(profile(access: nil, isFurniture: true)) == ["move", "store-here"])
    }

    @Test("a container in hand offers put back instead of pick up")
    func inHandRow() {
        let row = ids(profile(placement: .inHand(previous: "Kitchen")))

        #expect(row.first == "put-back")
        #expect(!row.contains("pick-up"))
    }

    @Test("a retired container offers only restore")
    func retiredRow() {
        #expect(ids(profile(access: .closed, lifecycle: .retired)) == ["restore"])
    }
}

/// What the browser's filter and stats count.
@Suite("Inventory container browser")
internal struct InventoryContainerBrowserTests {
    private let profiles = [
        profile(),
        profile(isFull: true),
        profile(access: .closed),
        profile(access: .closed, isFull: true),
        profile(access: .closed, lifecycle: .retired, isFull: true),
        profile(access: nil, isFurniture: true),
    ]

    @Test("a retired container is neither open, closed nor full")
    func retiredIsOnlyRetired() {
        let retired = profiles[4]

        #expect(!InventoryContainerFilter.closed.matches(retired))
        #expect(!InventoryContainerFilter.full.matches(retired))
        #expect(InventoryContainerFilter.retired.matches(retired))
    }

    @Test("stats count each state once and furniture only in the total")
    func stats() {
        let stats = InventoryContainerStats(profiles)

        #expect(stats == InventoryContainerStats(profiles.reversed()))
        #expect(stats.open == 2)
        #expect(stats.closed == 2)
        #expect(stats.full == 2)
        #expect(stats.total == 6)
    }

    @Test("all matches everything")
    func allMatches() {
        #expect(profiles.allSatisfy(InventoryContainerFilter.all.matches))
    }

    @Test("closing an open container moves it from the open count to the closed one")
    func closingMovesTheCount() {
        let closed = profiles[1].closed()

        #expect(closed.item.access == .closed)
        #expect(closed.isClosed)
        #expect(!closed.isOpen)
        #expect(closed.isFull)
        #expect(closed.id == profiles[1].id)

        let stats = InventoryContainerStats([profiles[0], closed])
        #expect(stats.open == 1)
        #expect(stats.closed == 1)
        #expect(stats.full == 1)
        #expect(stats.total == 2)
    }

    @Test(
        "closing leaves anything that is not open untouched",
        arguments: [2, 4, 5])
    func closingIgnoresTheRest(index: Int) {
        let original = profiles[index]
        let closed = original.closed()

        #expect(closed.item.access == original.item.access)
        #expect(closed.isOpen == original.isOpen)
        #expect(closed.isClosed == original.isClosed)
        #expect(InventoryContainerStats([closed]) == InventoryContainerStats([original]))
    }
}

/// Which containers a "put in" can legally target, given the rule that a
/// container cannot end up inside itself or inside anything it already
/// contains.
@Suite("Inventory container packing")
internal struct InventoryContainerPackingTests {
    private func container(_ id: String) -> InventoryFoundationItem {
        item(id, access: .open)
    }

    @Test("a container is not offered as its own destination")
    func excludesSelf() {
        let valid = InventoryContainerPacking.validDestinations(
            for: "crate", candidates: [container("crate")], parents: [:])

        #expect(valid.isEmpty)
    }

    @Test("a container is not offered a destination that is already inside it")
    func excludesDescendants() {
        let parents = ["middle": "outer", "inner": "middle"]

        let valid = InventoryContainerPacking.validDestinations(
            for: "outer",
            candidates: [container("outer"), container("middle"), container("inner")],
            parents: parents)

        #expect(valid.isEmpty)
    }

    @Test("an unrelated container is still offered")
    func unrelatedContainerIsOffered() {
        let valid = InventoryContainerPacking.validDestinations(
            for: "crate", candidates: [container("crate"), container("sibling")],
            parents: ["sibling": "elsewhere"])

        #expect(valid.map(\.id) == ["sibling"])
    }

    @Test("a plain item never qualifies as a destination")
    func nonContainersAreNeverOffered() {
        let valid = InventoryContainerPacking.validDestinations(
            for: "a", candidates: [item("cable")], parents: [:])

        #expect(valid.isEmpty)
    }
}
