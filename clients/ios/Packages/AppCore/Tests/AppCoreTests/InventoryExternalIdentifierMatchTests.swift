import AppCore
import AppCoreFakes
import Foundation
import Testing

/// The comparison a scanned barcode is looked up under, and the fake's
/// `items(withExternalIdentifier:)` that `FeatureInventory`'s scan tests read.
@Suite("Inventory external identifier match")
internal struct InventoryExternalIdentifierMatchTests {
    private static func item(
        _ id: String, name: String? = nil, ids: [(String, String)], deleted: Bool = false,
        lifecycle: InventoryLifecycle = .active
    ) -> InventoryItem {
        InventoryItem(
            id: id, revision: 1, seq: 1, name: name ?? id, typeKey: nil,
            externalIds: ids.map { InventoryExternalIdentifier(kind: $0.0, value: $0.1) },
            lifecycle: lifecycle, placement: .hand, createdAt: .now, updatedAt: .now,
            deletedAt: deleted ? .now : nil)
    }

    @Test("the key drops spaces and hyphens, trims, and uppercases")
    func matchKey() {
        #expect(InventoryExternalIdentifierMatch.matchKey(" 978-0 14\n") == "978014")
        #expect(InventoryExternalIdentifierMatch.matchKey("sn-ab12") == "SNAB12")
        #expect(InventoryExternalIdentifierMatch.matchKey("\t501\r\n") == "501")
    }

    @Test("an EAN-13 with a leading zero also tries its UPC-A spelling, and back")
    func upcCandidates() {
        #expect(
            InventoryExternalIdentifierMatch.candidateKeys(for: "0012345678905")
                == ["0012345678905", "012345678905"])
        #expect(
            InventoryExternalIdentifierMatch.candidateKeys(for: "012345678905")
                == ["012345678905", "0012345678905"])
    }

    @Test("a non-numeric or other-length code tries only itself")
    func noExtraCandidates() {
        #expect(
            InventoryExternalIdentifierMatch.candidateKeys(for: "0ABCDEFGHIJKL") == [
                "0ABCDEFGHIJKL"
            ])
        #expect(
            InventoryExternalIdentifierMatch.candidateKeys(for: "9780141036144") == [
                "9780141036144"
            ])
    }

    @Test("a payload that reduces to nothing matches nothing, not every empty value")
    func emptyPayload() {
        #expect(InventoryExternalIdentifierMatch.candidateKeys(for: " - ").isEmpty)
        #expect(
            !InventoryExternalIdentifierMatch.matches(
                [InventoryExternalIdentifier(kind: "barcode", value: "-")], payload: " "))
    }

    @Test("the fake finds every live holder, inactive included, ordered by name")
    func fakeLookup() async throws {
        let store = InMemoryInventoryStore(items: [
            Self.item("b", name: "Mug two", ids: [("barcode", "5012345678900")]),
            Self.item(
                "a", name: "mug one", ids: [("barcode", "501-2345678900")], lifecycle: .retired),
            Self.item("gone", ids: [("barcode", "5012345678900")], deleted: true),
            Self.item("other", ids: [("barcode", "5099999999999")]),
        ])

        var iterator = store.observe(.items(withExternalIdentifier: "5012345678900"))
            .makeAsyncIterator()
        let found = try #require(await iterator.next())

        #expect(found.map(\.id) == ["a", "b"])
    }
}
