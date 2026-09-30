import AppCore
import InventoryReplica
import Testing

/// `items(withExternalIdentifier:)` against the real GRDB replica: the SQL
/// reduction has to agree with `InventoryExternalIdentifierMatch.matchKey`.
@Suite("Replica item lookup by external identifier")
internal struct ReplicaExternalIdentifierLookupTests {
    private static func barcode(_ value: String) -> [InventoryExternalIdentifier] {
        [InventoryExternalIdentifier(kind: "barcode", value: value)]
    }

    @Test("every item carrying the scanned barcode is found, ordered by name")
    func everyHolderFound() throws {
        let replica = try Fixture.downloaded(items: [
            Fixture.item("b", name: "Mug two", externalIds: Self.barcode("5012345678900")),
            Fixture.item("a", name: "Mug one", externalIds: Self.barcode("5012345678900")),
            Fixture.item("c", name: "Plate", externalIds: Self.barcode("5099999999999")),
        ])

        let found = try replica.read(.items(withExternalIdentifier: "5012345678900"))

        #expect(found.map(\.id) == ["a", "b"])
    }

    @Test("a hyphenated ISBN a person typed matches the digits a scan reads")
    func hyphenatedStoredValueMatches() throws {
        let replica = try Fixture.downloaded(items: [
            Fixture.item(
                "book",
                externalIds: [InventoryExternalIdentifier(kind: "isbn", value: "978-0-14-103614-4")]
            )
        ])

        let found = try replica.read(.items(withExternalIdentifier: "9780141036144"))

        #expect(found.map(\.id) == ["book"])
    }

    @Test("a UPC-A typed as twelve digits matches the EAN-13 the camera reports")
    func upcAMatchesEAN13() throws {
        let replica = try Fixture.downloaded(items: [
            Fixture.item("a", externalIds: Self.barcode("012345678905"))
        ])

        let found = try replica.read(.items(withExternalIdentifier: "0012345678905"))

        #expect(found.map(\.id) == ["a"])
    }

    @Test("a lowercase serial matches its uppercase scan")
    func caseInsensitive() throws {
        let replica = try Fixture.downloaded(items: [
            Fixture.item(
                "a", externalIds: [InventoryExternalIdentifier(kind: "serial", value: "sn-ab12")])
        ])

        #expect(try replica.read(.items(withExternalIdentifier: "SNAB12")).map(\.id) == ["a"])
    }

    @Test("a barcode nothing carries, or only a tombstone carries, finds nothing")
    func noMatchAndTombstone() throws {
        let replica = try Fixture.downloaded(items: [
            Fixture.item(
                "gone", deletedAt: Fixture.created, externalIds: Self.barcode("5012345678900"))
        ])

        #expect(try replica.read(.items(withExternalIdentifier: "5012345678900")).isEmpty)
        #expect(try replica.read(.items(withExternalIdentifier: "4000000000000")).isEmpty)
    }

    @Test("a prefix of a stored barcode is not a match")
    func prefixIsNotAMatch() throws {
        let replica = try Fixture.downloaded(items: [
            Fixture.item("a", externalIds: Self.barcode("5012345678900"))
        ])

        #expect(try replica.read(.items(withExternalIdentifier: "501234")).isEmpty)
    }
}
