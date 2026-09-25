import AppCore
import Testing

@testable import DesignPlayground

@Suite("Purchase detail bank match fixtures")
@MainActor
internal struct PurchaseDetailBankMatchFixtureTests {
    private typealias BankMatch = PurchaseDetailBankMatchFixtures

    @Test(
        "each staged split adds up and matches its transactions, as the server guarantees",
        arguments: ["matched", "partial", "shared", "undescribed"])
    func splitsAddUp(_ name: String) throws {
        let detail = try #require(Self.fixture(name))
        let accounting = try #require(detail.accounting)
        let matched = detail.charges.flatMap(\.matches).reduce(0) { $0 + $1.amount.minorUnits }

        #expect(accounting.total == detail.purchase.total)
        #expect(
            accounting.total.minorUnits
                == accounting.matched.minorUnits + accounting.awaitingImport.minorUnits
                + accounting.residual.minorUnits)
        #expect(accounting.matched.minorUnits == matched)
    }

    @Test("the part-matched fixture is a partial purchase with something left unmatched")
    func partialIsPartial() throws {
        let accounting = try #require(BankMatch.partial.accounting)

        #expect(BankMatch.partial.purchase.status == .partial)
        #expect(accounting.unmatched.minorUnits > 0)
    }

    private static func fixture(_ name: String) -> DesignPlayground.PurchaseDetail? {
        switch name {
        case "matched": BankMatch.matched
        case "partial": BankMatch.partial
        case "shared": BankMatch.shared
        case "undescribed": BankMatch.undescribed
        default: nil
        }
    }
}
