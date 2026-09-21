import AppCore
import Testing

@testable import DesignPlayground

/// Which fields of a saved purchase can change, and the two conversions the
/// edit sheet and the detail's failure states lean on.
@Suite("Editing a saved purchase")
@MainActor
internal struct PurchaseEditPolicyTests {
    @Test(
        "a purchase finance has matched holds merchant, date and total",
        arguments: [PurchaseSettlement.linked, .partial, .unrecognised("refunded")])
    func matchedPurchasesLock(status: PurchaseSettlement) {
        #expect(PurchaseEditPolicy.lockedFields(for: status) == [.merchant, .date, .total])
        #expect(PurchaseEditPolicy.lock(for: status) != nil)
    }

    @Test(
        "a purchase no transaction explains is editable everywhere",
        arguments: [PurchaseSettlement.awaitingSettlement, .settledCash, .ignored])
    func unmatchedPurchasesDoNotLock(status: PurchaseSettlement) {
        #expect(PurchaseEditPolicy.lockedFields(for: status).isEmpty)
        #expect(PurchaseEditPolicy.lock(for: status) == nil)
    }

    @Test("amounts go into the form as the plain figures a receipt prints")
    func plainAmounts() {
        #expect(plain(1_609) == "16.09")
        #expect(plain(540) == "5.40")
        #expect(plain(5) == "0.05")
        #expect(plain(-1_000) == "10.00")
    }

    private func plain(_ minorUnits: Int) -> String {
        PurchaseEditDraft.plain(MoneyAmount(minorUnits: minorUnits, currencyCode: "AUD"))
    }

    @Test("only a failure that can answer differently offers Retry")
    func retryOnlyWhereItCanHelp() {
        let retryable: [PurchaseDetailFailure] = [.offline, .unreachable]
        let final: [PurchaseDetailFailure] = [.notFound, .unauthorized, .contractMismatch]
        #expect(retryable.allSatisfy(PurchaseDetailCopy.isRetryable))
        #expect(!final.contains(where: PurchaseDetailCopy.isRetryable))
    }
}
