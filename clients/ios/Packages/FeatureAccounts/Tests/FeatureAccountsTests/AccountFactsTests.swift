import AppCore
import Foundation
import Testing

@testable import FeatureAccounts

@Suite("Checking facts")
internal struct CheckingFactsTests {
    @Test("fewer than two points of history is nothing to compute")
    func tooShortHistory() {
        #expect(
            CheckingFacts(history: [AccountBalancePoint(month: "2026-01", balanceMinorUnits: 0)])
                == nil)
        #expect(CheckingFacts(history: []) == nil)
    }

    @Test("net this month is the difference between the last two closing balances")
    func netThisMonth() {
        let history = [
            AccountBalancePoint(month: "2026-01", balanceMinorUnits: 1_000),
            AccountBalancePoint(month: "2026-02", balanceMinorUnits: 1_500),
        ]

        let facts = CheckingFacts(history: history)

        #expect(facts?.netThisMonth == 500)
        #expect(facts?.lastMonth == "2026-02")
    }

    @Test("the floor is the lowest closing balance in the series, not the first or last")
    func floorIsTheMinimum() {
        let history = [
            AccountBalancePoint(month: "2026-01", balanceMinorUnits: 1_000),
            AccountBalancePoint(month: "2026-02", balanceMinorUnits: 200),
            AccountBalancePoint(month: "2026-03", balanceMinorUnits: 1_400),
        ]

        let facts = CheckingFacts(history: history)

        #expect(facts?.floorBalance == 200)
        #expect(facts?.floorMonth == "2026-02")
    }
}

@Suite("Card facts")
internal struct CardFactsTests {
    private let account = Account.fake(
        kind: .creditCard, balance: MoneyAmount(minorUnits: -30_000, currencyCode: "AUD"))

    @Test("a zero credit limit produces no facts, rather than dividing by zero")
    func zeroLimitIsNil() {
        let card = AccountCardCycle(
            creditLimitMinorUnits: 0, closesOn: Date(), dueOn: Date(),
            cycleSpendMinorUnits: 0, previousCycleSpendMinorUnits: 0)

        #expect(CardFacts(account: account, card: card) == nil)
    }

    @Test("utilisation is the balance owed over the limit")
    func utilisationFraction() {
        let card = AccountCardCycle(
            creditLimitMinorUnits: 100_000, closesOn: Date(), dueOn: Date(),
            cycleSpendMinorUnits: 5_000, previousCycleSpendMinorUnits: 5_000)

        let facts = CardFacts(account: account, card: card)

        #expect(facts?.fraction == 0.3)
        #expect(facts?.percentUsed == 30)
    }

    @Test("utilisation past the limit clamps rather than exceeding 100 percent")
    func utilisationClampsAtOne() {
        let overLimitAccount = Account.fake(
            kind: .creditCard, balance: MoneyAmount(minorUnits: -150_000, currencyCode: "AUD"))
        let card = AccountCardCycle(
            creditLimitMinorUnits: 100_000, closesOn: Date(), dueOn: Date(),
            cycleSpendMinorUnits: 0, previousCycleSpendMinorUnits: 0)

        let facts = CardFacts(account: overLimitAccount, card: card)

        #expect(facts?.fraction == 1)
        #expect(facts?.percentUsed == 100)
    }

    @Test("due within a week is flagged, further out is not")
    func dueSoonFlag() {
        let soon = AccountCardCycle(
            creditLimitMinorUnits: 100_000,
            closesOn: Date(),
            dueOn: Calendar.current.date(byAdding: .day, value: 3, to: Date()) ?? Date(),
            cycleSpendMinorUnits: 0, previousCycleSpendMinorUnits: 0)
        let later = AccountCardCycle(
            creditLimitMinorUnits: 100_000,
            closesOn: Date(),
            dueOn: Calendar.current.date(byAdding: .day, value: 20, to: Date()) ?? Date(),
            cycleSpendMinorUnits: 0, previousCycleSpendMinorUnits: 0)

        #expect(CardFacts(account: account, card: soon)?.isDueSoon == true)
        #expect(CardFacts(account: account, card: later)?.isDueSoon == false)
    }
}
