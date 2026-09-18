import Testing

@testable import AppCore

/// Every case here has a twin in `libs/sdk/src/soft-uri.test.ts` — the two
/// parsers must agree, because a label printed by one platform is scanned by
/// the other.
@Suite("parsePopsURI")
internal struct PopsURITests {
    @Test("splits a well-formed reference")
    func splitsAWellFormedReference() {
        #expect(
            parsePopsURI("pops://finance/transaction/abc-123")
                == PopsURI(pillar: "finance", type: "transaction", id: "abc-123"))
    }

    @Test("keeps an id containing slashes whole")
    func keepsAnIdContainingSlashesWhole() {
        #expect(
            parsePopsURI("pops://documents/document/a/b")
                == PopsURI(pillar: "documents", type: "document", id: "a/b"))
    }

    @Test(
        "rejects a malformed uri",
        arguments: [
            "",
            "not-a-uri",
            "not a uri at all",
            "http://finance/transaction/x",
            "pops://finance",
            "pops://inventory/item",
            "pops://inventory//1",
            "pops://finance/transaction/",
        ])
    func rejectsAMalformedURI(uri: String) {
        #expect(parsePopsURI(uri) == nil)
    }

    @Test("splits the singular Inventory item reference ADR-002 D13 specifies")
    func splitsTheInventoryItemReference() {
        #expect(
            parsePopsURI("pops://inventory/item/9c5e1e0e-1c1a-4b7a-9c1a-9c1a9c1a9c1a")
                == PopsURI(
                    pillar: "inventory", type: "item",
                    id: "9c5e1e0e-1c1a-4b7a-9c1a-9c1a9c1a9c1a"))
    }

    @Test("splits the Inventory location reference ADR-002 D13 specifies")
    func splitsTheInventoryLocationReference() {
        #expect(
            parsePopsURI("pops://inventory/location/loc-1")
                == PopsURI(pillar: "inventory", type: "location", id: "loc-1"))
    }
}
