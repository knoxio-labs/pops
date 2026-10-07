import AppCore
import Foundation

internal enum GuestTone: Hashable, Sendable {
    case positive
    case negative
    case neutral
}

internal struct GuestBalanceReading: Hashable, Sendable {
    internal let caption: String
    internal let amount: String
    internal let tone: GuestTone
}

/// Every figure and date a guest screen prints, worded from the guest's side.
///
/// A person account stores its balance from the operator's side: positive
/// means the guest owes. Printing that sign to the guest would show a debt as
/// a green plus, so on a person account the words carry the direction and the
/// figure is printed without a sign.
internal struct GuestPresentation: Sendable {
    private let locale: Locale
    private let timeZone: TimeZone

    internal init(
        locale: Locale = .autoupdatingCurrent, timeZone: TimeZone = .autoupdatingCurrent
    ) {
        self.locale = locale
        self.timeZone = timeZone
    }

    internal func title(_ account: GuestAccount) -> String {
        account.isPersonLedger ? account.owner : account.account.name
    }

    internal func subtitle(_ account: GuestAccount) -> String {
        let shape =
            account.isPersonLedger
            ? GuestCopy.personLedger : GuestCopy.sharedBy(account.owner)
        return account.canEdit ? shape : "\(shape) · \(GuestCopy.viewOnly)"
    }

    internal func balance(_ account: GuestAccount) -> GuestBalanceReading {
        let balance = account.account.balance
        guard account.isPersonLedger else {
            return GuestBalanceReading(
                caption: GuestCopy.balance, amount: balance.formatted(locale: locale),
                tone: balance.minorUnits < 0 ? .negative : .neutral)
        }
        let magnitude = unsigned(balance)
        if balance.minorUnits > 0 {
            return GuestBalanceReading(
                caption: GuestCopy.youOwe(account.owner), amount: magnitude, tone: .negative)
        }
        if balance.minorUnits < 0 {
            return GuestBalanceReading(
                caption: GuestCopy.owesYou(account.owner), amount: magnitude, tone: .positive)
        }
        return GuestBalanceReading(
            caption: GuestCopy.settled(account.owner), amount: magnitude, tone: .neutral)
    }

    internal func amount(_ entry: GuestEntry, in account: GuestAccount) -> String {
        account.isPersonLedger ? unsigned(entry.amount) : entry.amount.formatted(locale: locale)
    }

    internal func kindLabel(_ entry: GuestEntry, in account: GuestAccount) -> String {
        guard let kind = GuestEntryKind.matching(entry, in: account) else {
            return GuestCopy.unlistedType(entry.type)
        }
        return GuestCopy.label(kind, owner: account.owner)
    }

    internal func subtitle(_ entry: GuestEntry, in account: GuestAccount) -> String {
        "\(kindLabel(entry, in: account)) · \(day(entry.date))"
    }

    /// The line under a row's title. It drops the year a full date carries,
    /// because a list row has one line and the entry's own page has the rest.
    /// In a list across accounts an ordinary row leads with its account; a
    /// person ledger row already names the other party in who paid.
    internal func rowSubtitle(
        _ entry: GuestEntry, in account: GuestAccount, namingAccount: Bool = false
    ) -> String {
        let lead =
            namingAccount && !account.isPersonLedger
            ? title(account) : kindLabel(entry, in: account)
        return "\(lead) · \(shortDay(entry.date))"
    }

    internal func shortDay(_ date: Date) -> String {
        var style = Date.FormatStyle(locale: locale, calendar: locale.calendar, timeZone: timeZone)
        style = style.day().month(.abbreviated)
        return date.formatted(style)
    }

    internal func day(_ date: Date) -> String {
        date.formatted(style(time: .omitted))
    }

    internal func moment(_ date: Date) -> String {
        date.formatted(style(time: .shortened))
    }

    internal func money(_ amount: MoneyAmount) -> String {
        amount.formatted(locale: locale)
    }

    private func unsigned(_ amount: MoneyAmount) -> String {
        MoneyAmount(minorUnits: abs(amount.minorUnits), currencyCode: amount.currencyCode)
            .formatted(locale: locale)
    }

    private func style(time: Date.FormatStyle.TimeStyle) -> Date.FormatStyle {
        Date.FormatStyle(
            date: .abbreviated, time: time, locale: locale, calendar: locale.calendar,
            timeZone: timeZone)
    }
}
