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

/// A resolved merchant carries two names and the screen has to pick the right
/// one; an unresolved one carries a label nothing confirmed. Collapsing the
/// two was the defect POPS-3634 records.
@Suite("Merchant identity")
internal struct MerchantIdentityTests {
    @Test("a resolved merchant shows the entity's name, not the till's")
    func entityPrefersItsOwnName() {
        let merchant = MerchantIdentity.entity(
            id: "ent-bunnings", name: "Bunnings", printed: "BUNNINGS WAREHOUSE ALEXANDRIA")

        #expect(merchant.displayName == "Bunnings")
        #expect(merchant.isUnverified == false)
    }

    /// The printed wording is kept rather than discarded: it is what the
    /// pillar is searched by, so a resolved purchase has to be able to answer
    /// with it even though the screen does not show it.
    @Test("a resolved merchant still carries what the receipt said")
    func entityKeepsThePrintedWording() {
        let merchant = MerchantIdentity.entity(
            id: "ent-kmart", name: "Kmart", printed: "K mart")

        guard case .entity(_, _, let printed) = merchant else {
            Issue.record("expected an entity")
            return
        }
        #expect(printed == "K mart")
    }

    @Test("an unresolved merchant shows what was printed, untidied")
    func printedIsShownAsPrinted() {
        let merchant = MerchantIdentity.printed("TONGLI SUPERMARKET")

        #expect(merchant.displayName == "TONGLI SUPERMARKET")
        #expect(merchant.isUnverified)
    }

    @Test("a merchant the pillar could not read has no name to show")
    func unattributedHasNoName() {
        #expect(MerchantIdentity.unattributed.displayName == nil)
        #expect(MerchantIdentity.unattributed.isUnverified)
    }

    /// Two purchases at the same shop, one resolved and one not, are not the
    /// same merchant as far as this type is concerned — which is the point of
    /// modelling it rather than comparing strings.
    @Test("a resolved merchant and the bare label it printed are not equal")
    func resolutionIsPartOfIdentity() {
        let resolved = MerchantIdentity.entity(id: "ent-aldi", name: "ALDI", printed: "ALDI STORES")

        #expect(resolved != .printed("ALDI STORES"))
        #expect(resolved != .printed("ALDI"))
    }
}
