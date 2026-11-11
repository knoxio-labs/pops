import AppCoreFakes
import Testing

@testable import AppCore

@Suite("Inventory code links")
internal struct InventoryCodeURITests {
    private static func item(_ id: String, code: String, deleted: Bool = false) -> InventoryItem {
        InventoryItem(
            id: id, revision: 1, seq: 1, name: id, typeKey: nil, code: code,
            placement: .hand, createdAt: .now, updatedAt: .now,
            deletedAt: deleted ? .now : nil)
    }

    @Test("preserves code spelling", arguments: ["CAB-123", "cab-123", "A_1"])
    func preservesCode(_ code: String) {
        #expect(parseInventoryCodeURI("pops-i://\(code)") == code)
    }

    @Test("decodes punctuation without interpreting it as a path")
    func decodesCode() {
        #expect(parseInventoryCodeURI("pops-i://Cab%2F123%20%23%3F%40%3A") == "Cab/123 #?@:")
        #expect(parseInventoryCodeURI("pops-i://Cab!'123") == "Cab!'123")
    }

    @Test(
        "rejects malformed links",
        arguments: [
            "pops-i://", "pops-i:///CAB-123", "pops-i://CAB-123/item",
            "pops-i://CAB-123?code=OTHER", "pops-i://CAB-123#other",
            "pops-i://user@CAB-123", "pops-i://CAB-123:42", "pops-i://CAB%ZZ123",
            "pops-i://%20", "https://CAB-123", "pops://inventory/item/123",
        ])
    func rejectsMalformed(_ raw: String) {
        #expect(parseInventoryCodeURI(raw) == nil)
    }

    @Test("resolves codes case-insensitively and ignores deleted holders")
    func resolvesCurrentCode() async {
        let store = InMemoryInventoryStore(items: [
            Self.item("one", code: "CAB-123"),
            Self.item("gone", code: "CAB-999", deleted: true),
        ])
        #expect(
            await resolveInventoryCodeURI("pops-i://cab-123", store: store)
                == PopsURI(pillar: "inventory", type: "item", id: "one"))
        #expect(await resolveInventoryCodeURI("pops-i://CAB-999", store: store) == nil)
        #expect(await resolveInventoryCodeURI("pops-i://MISSING", store: store) == nil)
    }
}
