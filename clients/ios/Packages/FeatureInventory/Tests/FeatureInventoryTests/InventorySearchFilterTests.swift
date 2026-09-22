import AppCore
import AppCoreFakes
import Testing

@testable import FeatureInventory

@Suite("Inventory search filter")
internal struct InventorySearchFilterTests {
    private typealias Fixture = InventoryListFixture

    @Test(
        "inactive records are left out unless Include inactive is on",
        arguments: [
            InventoryLifecycle.retired, .discarded, .lost, .destroyed, .unrecognised("archived"),
        ])
    func includeInactive(lifecycle: InventoryLifecycle) {
        let inactive = Fixture.record("chair", lifecycle: lifecycle)
        var filter = InventorySearchFilter()

        #expect(!filter.matches(inactive))
        #expect(filter.matches(Fixture.record("hose")))

        filter.includesInactive = true
        #expect(filter.matches(inactive))
        #expect(filter.matches(Fixture.record("hose")))
    }

    @Test("Include inactive does not override any other narrowing")
    func includeInactiveStillNarrows() {
        var filter = InventorySearchFilter()
        filter.missing = .type
        filter.includesInactive = true

        #expect(!filter.matches(Fixture.record("chair", type: "tool", lifecycle: .discarded)))
        #expect(filter.matches(Fixture.record("chair", type: nil, lifecycle: .discarded)))
    }

    @Test("missing type keeps only records with no type, whatever their name or code")
    func missingType() {
        var filter = InventorySearchFilter()
        filter.missing = .type

        #expect(filter.matches(Fixture.record("untyped", type: nil)))
        #expect(!filter.matches(Fixture.record("typed", type: "tool")))
        #expect(
            !filter.matches(Fixture.record("untyped but inactive", type: nil, lifecycle: .lost)))
    }

    @Test(
        "missing code and missing photo test their own field only",
        arguments: [
            (InventoryMissingFilter.code, Fixture.record("a", code: nil, photo: "sha"), true),
            (.code, Fixture.record("a", code: "B412", photo: nil), false),
            (.photo, Fixture.record("a", code: "B412", photo: nil), true),
            (.photo, Fixture.record("a", code: nil, photo: "sha"), false),
        ])
    func missingOtherFields(missing: InventoryMissingFilter, record: InventoryRecord, kept: Bool) {
        var filter = InventorySearchFilter()
        filter.missing = missing
        #expect(filter.matches(record) == kept)
    }

    @Test(
        "placement narrows to exactly one of the three",
        arguments: [
            (InventoryPlacementFilter.inHand, InventoryRecord.Placement.hand, true),
            (.inHand, .location, false),
            (.direct, .location, true),
            (.direct, .container, false),
            (.contained, .container, true),
            (.contained, .hand, false),
            (.any, .hand, true),
        ])
    func placement(
        filter: InventoryPlacementFilter, placement: InventoryRecord.Placement, kept: Bool
    ) {
        let record = Fixture.record("a", placement: placement)
        var searchFilter = InventorySearchFilter()
        searchFilter.placement = filter
        #expect(searchFilter.matches(record) == kept)
    }

    @Test("container state leaves out anything that is not a container in that state")
    func containerState() {
        var open = InventorySearchFilter()
        open.containerState = .open
        var closed = InventorySearchFilter()
        closed.containerState = .closed

        #expect(open.matches(Fixture.record("box", access: .open)))
        #expect(!open.matches(Fixture.record("box", access: .closed)))
        #expect(!open.matches(Fixture.record("plate", access: nil)))
        #expect(closed.matches(Fixture.record("box", access: .closed)))
        #expect(!closed.matches(Fixture.record("plate", access: nil)))
    }

    @Test("More than one starts at two")
    func quantity() {
        var filter = InventorySearchFilter()
        filter.quantity = .several

        #expect(!filter.matches(Fixture.record("a", quantity: 1)))
        #expect(filter.matches(Fixture.record("a", quantity: 2)))
    }

    @Test(
        "waiting covers saved, queued and syncing; the other sync filters are exact",
        arguments: [
            (InventorySyncFilter.waiting, InventorySync.saved, true),
            (.waiting, .queued, true),
            (.waiting, .synchronizing, true),
            (.waiting, .synchronized, false),
            (.waiting, .stale, false),
            (.stale, .stale, true),
            (.stale, .needsAttention, false),
            (.needsAttention, .needsAttention, true),
            (.needsAttention, .queued, false),
        ])
    func sync(filter: InventorySyncFilter, sync: InventorySync, kept: Bool) {
        let record = Fixture.record("a", sync: sync)
        var searchFilter = InventorySearchFilter()
        searchFilter.sync = filter
        #expect(searchFilter.matches(record) == kept)
    }

    @Test("a type filter matches by key, not by the name shown")
    func typeByKey() {
        var filter = InventorySearchFilter()
        filter.type = InventoryTypeName(key: "tool", name: "Tool")

        #expect(filter.matches(Fixture.record("a", type: "tool")))
        #expect(!filter.matches(Fixture.record("a", type: "Tool")))
        #expect(!filter.matches(Fixture.record("a", type: nil)))
    }

    @Test("the summary names every narrowing in order, and is empty with none")
    func summary() {
        #expect(InventorySearchFilter().summary.isEmpty)
        #expect(!InventorySearchFilter().isActive)

        var filter = InventorySearchFilter()
        filter.placement = .contained
        filter.missing = .type
        filter.includesInactive = true
        #expect(filter.isActive)
        #expect(filter.summary == "In a container, No type, Including inactive")
    }

    @Test("the default value is the Reset contract")
    func resetContract() {
        var filter = InventorySearchFilter()
        filter.placement = .contained
        filter.includesInactive = true

        filter = InventorySearchFilter()

        #expect(!filter.isActive)
        #expect(filter.summary.isEmpty)
        #expect(filter.placement == .any)
        #expect(!filter.includesInactive)
    }

    @Test("recent scans keep stored order, skip missing and deleted records, and cap at four")
    func recentlyScannedOrderAndLimit() async throws {
        let store = InMemoryInventoryStore(
            items: [
                Fixture.item("one", "One"),
                Fixture.item("two", "Two"),
                Fixture.item("three", "Three"),
                Fixture.item("four", "Four"),
                Fixture.item("five", "Five"),
                Fixture.item("deleted", "Deleted", deleted: true),
            ])

        let records = try #require(
            await Self.scanned(
                ["three", "missing", "deleted", "one", "five", "two", "four"],
                in: store))

        #expect(records.map(\.id) == ["three", "one", "five", "two"])
    }

    @Test("an empty recent-scan key resolves no tiles")
    func emptyRecentlyScanned() async throws {
        let records = try #require(await Self.scanned([], in: InMemoryInventoryStore()))
        #expect(records.isEmpty)
    }

    private static func scanned(
        _ ids: [InventoryItem.ID],
        in store: InMemoryInventoryStore
    ) async -> [InventoryRecord]? {
        var results = store.observe(
            InventorySearchResults.query(text: "", includeInactive: false, scannedIDs: ids)
        ).makeAsyncIterator()
        return await results.next()?.scanned
    }
}
