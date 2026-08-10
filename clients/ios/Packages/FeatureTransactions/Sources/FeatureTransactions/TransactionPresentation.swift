import AppCore
import Foundation

/// How a transaction's fields become the strings a row draws and VoiceOver
/// reads.
///
/// Locale and time zone are parameters rather than reads of the process's
/// current ones, so what a row says is something a test asserts rather than
/// something that depends on the machine running it. Both default to the
/// device's own, which is what the app passes and what the ticket's "formatted
/// for the user's locale" means.
///
/// Nothing here derives a sign or a currency. The BFM sends both, `MoneyAmount`
/// carries them as the server sent them, and re-deriving either on a phone is
/// how two screens end up disagreeing about whether a refund is money in.
internal struct TransactionPresentation: Sendable {
    private let locale: Locale
    private let timeZone: TimeZone

    internal init(
        locale: Locale = .autoupdatingCurrent,
        timeZone: TimeZone = .autoupdatingCurrent
    ) {
        self.locale = locale
        self.timeZone = timeZone
    }

    internal func amount(_ transaction: Transaction) -> String {
        transaction.amount.formatted(locale: locale)
    }

    /// The calendar comes from the locale rather than from the process, for the
    /// same reason the locale itself is a parameter: a fixed locale paired with
    /// whatever calendar the machine happens to use is only half-pinned, and
    /// the half that is loose is the one that changes the digits.
    internal func date(_ transaction: Transaction) -> String {
        transaction.date.formatted(
            Date.FormatStyle(
                date: .abbreviated,
                time: .omitted,
                locale: locale,
                calendar: locale.calendar,
                timeZone: timeZone
            )
        )
    }

    /// Who it was with and when, as one line. The entity is dropped rather than
    /// rendered as a placeholder when the BFM sends none — most transactions
    /// have one, and a row of dashes for the ones that do not is noise.
    internal func subtitle(_ transaction: Transaction) -> String {
        [transaction.entityName, date(transaction)]
            .compactMap { $0 }
            .joined(separator: separator)
    }

    /// What kind of transaction it is, and what it has been tagged with. The
    /// type is always there, so this line always says something — an untagged
    /// transaction reads as its type alone rather than as a gap.
    internal func caption(_ transaction: Transaction) -> String {
        ([transaction.type.rawValue] + transaction.tags).joined(separator: separator)
    }

    /// The row as one sentence, because VoiceOver reads a row as one utterance
    /// and a list of fragments does not parse as anything.
    ///
    /// Commas rather than the visual separator: the middle dot is announced as
    /// punctuation by some voices and skipped by others, and neither is a
    /// sentence.
    internal func accessibilityLabel(_ transaction: Transaction) -> String {
        var parts = [transaction.description, amount(transaction), date(transaction)]
        if let entityName = transaction.entityName { parts.append(entityName) }
        parts.append(transaction.type.rawValue)
        if !transaction.tags.isEmpty { parts.append(TransactionsCopy.tagList(transaction.tags)) }
        return parts.joined(separator: ", ")
    }

    /// Whether this row is money arriving, which is the only thing the list
    /// colours. Read off the amount the server sent and nothing else.
    internal func isCredit(_ transaction: Transaction) -> Bool {
        transaction.amount.minorUnits > 0
    }

    private var separator: String { " · " }
}
