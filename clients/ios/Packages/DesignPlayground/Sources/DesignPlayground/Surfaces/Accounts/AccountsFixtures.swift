import AppCore
import Foundation

/// The fuller records behind ``Fixtures``'s accounts, one per kind
/// ``AccountFactsView`` switches on — a checking account with a trend, a card
/// with a cycle, a person ledger with a history, a gift card with an original
/// value, and the two undated accounts ``AccountProvenanceTests`` in
/// `FeatureAccountsTests` pins.
extension Fixtures {
    public static let everydayDetail = AccountDetail(
        account: everyday,
        history: monthlyHistory(startingAt: 380_000, monthlyDelta: 4_000),
        recentTransactions: Array(transactionRows.prefix(3))
    )

    public static let amexDetail = AccountDetail(
        account: amex,
        card: AccountCardCycle(
            creditLimitMinorUnits: 1_000_000,
            closesOn: Date(timeIntervalSince1970: 1_786_400_000),
            dueOn: Date(timeIntervalSince1970: 1_787_000_000),
            cycleSpendMinorUnits: 180_000,
            previousCycleSpendMinorUnits: 150_000
        ),
        recentTransactions: Array(transactionRows.prefix(2))
    )

    public static let martaDetail = AccountDetail(
        account: marta,
        history: [
            AccountBalancePoint(month: "2026-06", balanceMinorUnits: -2_000),
            AccountBalancePoint(month: "2026-07", balanceMinorUnits: -6_400),
            AccountBalancePoint(month: "2026-08", balanceMinorUnits: -1_200),
            AccountBalancePoint(month: "2026-09", balanceMinorUnits: -6_400),
        ]
    )

    public static let giftCardDetail = AccountDetail(
        account: giftCard,
        originalValueMinorUnits: 10_000
    )

    /// Checkpointable and never checked — the fixture
    /// `AccountPresentationTests.asOfNoteNeverChecked` reaches in
    /// `FeatureAccountsTests`.
    public static let uncheckedDetail = AccountDetail(account: unchecked)

    /// Not checkpointable — the fixture `AccountPresentationTests.asOfNoteDerived`
    /// reaches in `FeatureAccountsTests`.
    public static let eurosDetail = AccountDetail(account: euros)

    public static let mortgageDetail = AccountDetail(
        account: mortgage,
        history: monthlyHistory(startingAt: -63_000_000, monthlyDelta: 140_000)
    )

    private static func monthlyHistory(
        startingAt minorUnits: Int,
        monthlyDelta: Int,
        count: Int = 12
    ) -> [AccountBalancePoint] {
        (0..<count).map { index in
            AccountBalancePoint(
                month: "2026-\(String(format: "%02d", index + 1))",
                balanceMinorUnits: minorUnits + index * monthlyDelta
            )
        }
    }
}
