import AppCore
import Foundation

/// What the add and edit form holds while it is open: an account, a type, a
/// date, an amount typed as a plain positive figure, and a description.
internal struct GuestTransactionDraft: Hashable, Sendable {
    internal enum Field: Hashable, Sendable, CaseIterable {
        case account
        case kind
        case amount
        case description
    }

    internal var accountID: Account.ID?
    internal var kindID: GuestEntryKind.ID?
    internal var date: Date
    internal var amountText: String
    internal var description: String

    /// A new entry. The account is chosen already when exactly one can be
    /// written to, because a picker with one option is a question with one
    /// answer.
    internal static func blank(accounts: [GuestAccount], on date: Date) -> GuestTransactionDraft {
        let writable = accounts.filter(\.canEdit)
        return GuestTransactionDraft(
            accountID: writable.count == 1 ? writable[0].id : nil, kindID: nil, date: date,
            amountText: "", description: "")
    }

    internal static func editing(_ entry: GuestEntry, in account: GuestAccount)
        -> GuestTransactionDraft
    {
        GuestTransactionDraft(
            accountID: account.id, kindID: GuestEntryKind.matching(entry, in: account)?.id,
            date: entry.date, amountText: plain(entry.amount), description: entry.description)
    }

    /// The unsigned figure a row prints into the amount field: no symbol, no
    /// sign, no grouping.
    internal static func plain(_ amount: MoneyAmount) -> String {
        let magnitude = MoneyAmount(
            minorUnits: abs(amount.minorUnits), currencyCode: amount.currencyCode)
        return magnitude.decimalValue.formatted(
            .number.grouping(.never).precision(.fractionLength(2))
                .locale(Locale(identifier: "en_US_POSIX")))
    }

    internal func account(in accounts: [GuestAccount]) -> GuestAccount? {
        accounts.first { $0.id == accountID && $0.canEdit }
    }

    internal func kind(in accounts: [GuestAccount]) -> GuestEntryKind? {
        guard let account = account(in: accounts) else { return nil }
        return GuestEntryKind.options(for: account).first { $0.id == kindID }
    }

    /// Moves the draft to another account, keeping the type only when the
    /// new account offers the same one.
    internal mutating func choose(_ account: GuestAccount) {
        accountID = account.id
        if !GuestEntryKind.options(for: account).contains(where: { $0.id == kindID }) {
            kindID = nil
        }
    }

    /// The typed amount as money, or `nil` when it is not a positive figure
    /// the currency can hold exactly.
    internal func magnitude(currencyCode: String) -> MoneyAmount? {
        let trimmed = amountText.trimmingCharacters(in: .whitespaces)
        let digits = trimmed.filter(\.isNumber).count
        let points = trimmed.filter { $0 == "." }.count
        guard digits > 0, points <= 1, digits + points == trimmed.count,
            trimmed.allSatisfy(\.isASCII),
            let typed = Decimal(string: trimmed, locale: Locale(identifier: "en_US_POSIX")),
            let amount = MoneyAmount(majorUnits: typed, currencyCode: currencyCode),
            amount.minorUnits > 0, amount.decimalValue == typed
        else { return nil }
        return amount
    }

    internal func missing(accounts: [GuestAccount]) -> Set<Field> {
        var missing: Set<Field> = []
        let account = account(in: accounts)
        if account == nil { missing.insert(.account) }
        if kind(in: accounts) == nil { missing.insert(.kind) }
        let currency = account?.account.balance.currencyCode
        if currency.flatMap({ magnitude(currencyCode: $0) }) == nil { missing.insert(.amount) }
        if description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            missing.insert(.description)
        }
        return missing
    }

    /// The amount as the ledger stores it, signed by the chosen type.
    internal func signedAmount(accounts: [GuestAccount]) -> MoneyAmount? {
        guard let account = account(in: accounts), let kind = kind(in: accounts),
            let magnitude = magnitude(currencyCode: account.account.balance.currencyCode)
        else { return nil }
        return kind.signed(magnitude)
    }

    /// The draft with a receipt's reading written over it. A total in another
    /// currency is never written: the ledger has no conversion, so a figure
    /// copied across would be wrong by the exchange rate.
    internal func applying(_ suggestion: GuestReceiptSuggestion, accounts: [GuestAccount])
        -> GuestTransactionDraft
    {
        var draft = self
        if let date = suggestion.date { draft.date = date }
        if let description = suggestion.description { draft.description = description }
        let currency = account(in: accounts)?.account.balance.currencyCode
        if let total = suggestion.total, let currency, total.currencyCode == currency {
            draft.amountText = Self.plain(total)
        }
        return draft
    }
}

/// What reading a receipt offered for review.
internal struct GuestReceiptSuggestion: Hashable, Sendable {
    internal let date: Date?
    internal let description: String?
    internal let total: MoneyAmount?

    /// Whether the receipt's total cannot be used on an account in
    /// `currencyCode`. `false` when either side is unknown, because that is
    /// not a mismatch, it is nothing to compare.
    internal func currencyMismatch(with currencyCode: String?) -> Bool {
        guard let total, let currencyCode else { return false }
        return total.currencyCode != currencyCode
    }
}

/// Where the attached receipt's reading stands.
internal enum GuestReceiptReading: Hashable, Sendable {
    case none
    case reading
    case suggested(GuestReceiptSuggestion)
    case applied
    case unreadable
    case unavailable
}

/// Why a save did not land.
internal enum GuestSaveFailure: Hashable, Sendable {
    case offline
    case unreachable
    case accessRevoked
    case readOnly

    /// Whether sending the same entry again could succeed.
    internal var isRetryable: Bool {
        switch self {
        case .offline, .unreachable: true
        case .accessRevoked, .readOnly: false
        }
    }

    internal var message: String {
        switch self {
        case .offline: "No connection. Nothing was saved."
        case .unreachable: "The server could not be reached. Nothing was saved."
        case .accessRevoked: "This account is no longer shared with you. Nothing was saved."
        case .readOnly: "You can now only view this account. Nothing was saved."
        }
    }
}
