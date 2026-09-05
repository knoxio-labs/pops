import AppCore
import Foundation

/// Fictional data, typed against the app's own domain types.
///
/// Typed rather than invented so a surface cannot be designed around a shape
/// the app cannot produce — the same rule the web playground's `src/fixtures/`
/// follows. Nothing here is fetched, cached or written: these are literals,
/// and that is what lets the playground run with no network, no database and
/// no permissions.
///
/// The numbers are deliberately awkward. A fixture set of round hundreds in
/// one currency proves a layout works for the case that never happens; these
/// carry a five-figure balance, a negative, a foreign currency and a name long
/// enough to truncate, because those are the ones that break a row.
public enum Fixtures {
    public static let aud = "AUD"

    public static func money(_ minorUnits: Int, _ code: String = aud) -> MoneyAmount {
        MoneyAmount(minorUnits: minorUnits, currencyCode: code)
    }

    private static func date(_ interval: TimeInterval) -> Date {
        Date(timeIntervalSince1970: interval)
    }

    public static let everyday = Account(
        id: "acc-everyday",
        name: "Everyday",
        kind: .checking,
        balance: money(428_140),
        archived: false,
        institutionName: "ANZ",
        balanceAsOf: date(1_786_000_000),
        transactionCount: 1_842
    )

    public static let savings = Account(
        id: "acc-savings",
        name: "Emergency fund",
        kind: .savings,
        balance: money(12_400_000),
        archived: false,
        institutionName: "Up",
        balanceAsOf: date(1_786_000_000),
        transactionCount: 96
    )

    public static let amex = Account(
        id: "acc-amex",
        name: "Amex Platinum Charge",
        kind: .creditCard,
        balance: money(-213_755),
        archived: false,
        institutionName: "American Express",
        balanceAsOf: date(1_785_900_000),
        transactionCount: 499
    )

    /// The one that truncates. A real institution name plus a real product
    /// name is longer than a 393pt row, and a fixture set without one is a set
    /// that never shows the ellipsis.
    public static let mortgage = Account(
        id: "acc-mortgage",
        name: "Owner-occupier variable, Kensington",
        kind: .loan,
        balance: money(-61_480_900),
        archived: false,
        institutionName: "Commonwealth Bank of Australia",
        balanceAsOf: date(1_785_800_000),
        transactionCount: 74
    )

    /// A foreign currency, so a column of amounts has to cope with a second
    /// symbol and a different minor-unit width.
    public static let euros = Account(
        id: "acc-euro",
        name: "Wise EUR",
        kind: .cash,
        balance: money(84_215, "EUR"),
        archived: false,
        institutionName: "Wise",
        transactionCount: 31
    )

    public static let marta = Account(
        id: "acc-marta",
        name: "Marta",
        kind: .person,
        balance: money(-6_400),
        archived: false,
        contact: "Marta Ferreira",
        transactionCount: 9
    )

    public static let giftCard = Account(
        id: "acc-gift",
        name: "Bunnings",
        kind: .giftCard,
        balance: money(4_550),
        archived: false,
        expiresOn: date(1_800_000_000),
        transactionCount: 3
    )

    public static let archived = Account(
        id: "acc-old-ing",
        name: "Old ING Orange",
        kind: .checking,
        balance: money(0),
        archived: true,
        institutionName: "ING",
        transactionCount: 612
    )

    /// Everything, archived included — what a list screen is handed.
    public static let allAccounts: [Account] = [
        everyday, savings, amex, mortgage, euros, marta, giftCard, archived,
    ]

    public static let activeAccounts: [Account] = allAccounts.filter { !$0.archived }
}

extension Fixtures {
    /// One line of a recent-activity list. A display shape rather than a
    /// domain type: the playground never has a `Transaction`, it has the four
    /// strings a row draws.
    public struct RecentLine: Hashable, Sendable {
        public let title: String
        public let when: String
        public let amount: String
        public let isCredit: Bool
    }

    public static let recentLines: [RecentLine] = [
        RecentLine(
            title: "Woolworths Metro", when: "Yesterday", amount: "−$48.20", isCredit: false),
        RecentLine(title: "Salary — Knoxio", when: "1 Sep", amount: "+$4,812.00", isCredit: true),
        RecentLine(
            title: "Transport for NSW Opal top-up", when: "31 Aug", amount: "−$40.00",
            isCredit: false),
        RecentLine(title: "Refund — Uniqlo", when: "29 Aug", amount: "+$79.95", isCredit: true),
    ]

    /// The accounts whose latest checkpoint disagrees with the ledger. A set
    /// rather than a field on `Account`, because disagreement is a fact about
    /// two records and not a property of one.
    public static let disagreeingCheckpoints: Set<String> = [amex.id]
}
