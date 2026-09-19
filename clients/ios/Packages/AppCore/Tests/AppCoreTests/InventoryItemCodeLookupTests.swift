import AppCore
import AppCoreFakes
import Foundation
import Testing

/// `item(withCode:)` (POPS-4108): what a scan of an item's printed code
/// resolves to, against the same fake `InventoryReplicaTests` exercises for
/// the real GRDB path.
@Suite("Inventory item lookup by code")
internal struct InventoryItemCodeLookupTests {
    private static func item(
        _ id: String, code: String?, deleted: Bool = false
    ) -> InventoryItem {
        InventoryItem(
            id: id, revision: 1, seq: 1, name: id, typeKey: nil, code: code,
            placement: .hand, createdAt: .now, updatedAt: .now,
            deletedAt: deleted ? .now : nil)
    }

    @Test("an exact code match is found")
    func exactMatch() async throws {
        let store = InMemoryInventoryStore(items: [Self.item("item-1", code: "ABC-123")])

        var iterator = store.observe(.item(withCode: "ABC-123")).makeAsyncIterator()
        let value = try #require(await iterator.next())

        #expect(value?.id == "item-1")
    }

    @Test("a code nothing carries answers nil")
    func noMatch() async throws {
        let store = InMemoryInventoryStore(items: [Self.item("item-1", code: "ABC-123")])

        var iterator = store.observe(.item(withCode: "ZZZ-999")).makeAsyncIterator()
        let value = try #require(await iterator.next())

        #expect(value == nil)
    }

    @Test("the comparison is case-insensitive, as the pillar's own index is")
    func caseInsensitive() async throws {
        let store = InMemoryInventoryStore(items: [Self.item("item-1", code: "ABC-123")])

        var iterator = store.observe(.item(withCode: "abc-123")).makeAsyncIterator()
        let value = try #require(await iterator.next())

        #expect(value?.id == "item-1")
    }

    /// A deleted item keeps its code reserved (never reissued), but a scan of
    /// it answers nil, the same as an id lookup does for a tombstoned row:
    /// the label reads as "no longer in Inventory", not as a hit on a gone
    /// record.
    @Test("a tombstoned holder's code is not found")
    func tombstonedHolderNotFound() async throws {
        let store = InMemoryInventoryStore(
            items: [Self.item("item-1", code: "ABC-123", deleted: true)])

        var iterator = store.observe(.item(withCode: "ABC-123")).makeAsyncIterator()
        let value = try #require(await iterator.next())

        #expect(value == nil)
    }

    @Test("an item with no code never matches an empty or arbitrary code")
    func noCodeNeverMatches() async throws {
        let store = InMemoryInventoryStore(items: [Self.item("item-1", code: nil)])

        var iterator = store.observe(.item(withCode: "")).makeAsyncIterator()
        let value = try #require(await iterator.next())

        #expect(value == nil)
    }
}
