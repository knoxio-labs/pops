import AppCore
import Testing

/// The mobile surface sends a purchase's settlement status as an open string,
/// so the mapping has two jobs: name the five the pillar publishes, and keep a
/// sixth it has never seen rather than refusing the row.
@Suite("Purchase settlement")
internal struct PurchaseSettlementTests {
    @Test(
        "every status the pillar publishes maps to a case",
        arguments: [
            ("awaiting_settlement", PurchaseSettlement.awaitingSettlement),
            ("linked", .linked),
            ("partial", .partial),
            ("settled_cash", .settledCash),
            ("ignored", .ignored),
        ]
    )
    func knownStatusesMap(wire: String, expected: PurchaseSettlement) {
        #expect(PurchaseSettlement(wire: wire) == expected)
    }

    @Test("a status this build has never heard of is kept, not discarded")
    func unknownStatusIsKept() {
        #expect(PurchaseSettlement(wire: "refunded_in_full") == .unrecognised("refunded_in_full"))
    }

    /// The mapping is exact rather than lenient on purpose: a pillar that
    /// renamed a status should show up as an unrecognised badge somebody
    /// notices, not be silently folded into the nearest known case.
    @Test(
        "near misses are unrecognised rather than coerced",
        arguments: ["Linked", "awaiting-settlement", "settled_cash ", ""]
    )
    func nearMissesDoNotCoerce(wire: String) {
        #expect(PurchaseSettlement(wire: wire) == .unrecognised(wire))
    }

    @Test(
        "only the two states still waiting on somebody count as unsettled",
        arguments: [
            (PurchaseSettlement.awaitingSettlement, true),
            (.partial, true),
            (.linked, false),
            (.settledCash, false),
            (.ignored, false),
            (.unrecognised("something new"), false),
        ]
    )
    func unsettledIsTheWaitingHalf(status: PurchaseSettlement, expected: Bool) {
        #expect(status.isUnsettled == expected)
    }
}
