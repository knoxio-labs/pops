import AppCore
import Foundation
import InventoryReplica
import Testing

/// `item(withCode:)` (POPS-4108) against the real GRDB replica, mirroring
/// `InventoryItemCodeLookupTests` in `AppCoreTests` for the fake.
@Suite("Replica item lookup by code")
internal struct ReplicaItemCodeLookupTests {
    @Test("an exact code match is found")
    func exactMatch() throws {
        let replica = try Fixture.downloaded(items: [Fixture.item("a", code: "ABC-123")])

        #expect(try replica.read(.item(withCode: "ABC-123"))?.id == "a")
    }

    @Test("a code nothing carries answers nil")
    func noMatch() throws {
        let replica = try Fixture.downloaded(items: [Fixture.item("a", code: "ABC-123")])

        #expect(try replica.read(.item(withCode: "ZZZ-999")) == nil)
    }

    @Test("the comparison is case-insensitive, as the pillar's own index is")
    func caseInsensitive() throws {
        let replica = try Fixture.downloaded(items: [Fixture.item("a", code: "ABC-123")])

        #expect(try replica.read(.item(withCode: "abc-123"))?.id == "a")
    }

    /// A deleted item keeps its code reserved, but the same tombstone rule
    /// this file's sibling documents for a plain id lookup applies here too:
    /// a scan of it is "target missing", not a hit on a gone record.
    @Test("a tombstoned holder's code is not found")
    func tombstonedHolderNotFound() throws {
        let replica = try Fixture.downloaded(
            items: [Fixture.item("a", code: "ABC-123", deletedAt: Fixture.created)])

        #expect(try replica.read(.item(withCode: "ABC-123")) == nil)
    }
}
