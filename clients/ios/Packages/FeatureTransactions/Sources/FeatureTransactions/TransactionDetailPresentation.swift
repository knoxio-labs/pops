import AppCore
import Foundation

/// How a transaction becomes the lines the detail screen draws.
///
/// Locale and time zone are parameters rather than reads of the process's own,
/// for the same reason they are in ``TransactionPresentation``: what a screen
/// says is then something a test asserts rather than something that passes in
/// Sydney and fails on a UTC runner.
///
/// A field finance has nothing for is dropped rather than drawn as a dash. The
/// list makes the same call about a missing entity, and the reasoning is the
/// same at greater scale here: a detail screen padded out with six empty labels
/// reads as a record that failed to load.
internal struct TransactionDetailPresentation: Sendable {
    private let presentation: TransactionPresentation

    internal init(
        locale: Locale = .autoupdatingCurrent,
        timeZone: TimeZone = .autoupdatingCurrent
    ) {
        presentation = TransactionPresentation(locale: locale, timeZone: timeZone)
    }

    /// The screen as it looks seeded from the list — everything the list row
    /// carries, and nothing invented to stand in for what it does not.
    internal func content(_ transaction: Transaction) -> TransactionDetailContent {
        TransactionDetailContent(
            title: transaction.description,
            amount: presentation.amount(transaction),
            date: presentation.date(transaction),
            isCredit: presentation.isCredit(transaction),
            fields: fields(
                type: transaction.type,
                entityName: transaction.entityName,
                tags: transaction.tags
            )
        )
    }

    /// The screen as it looks once the fuller record has landed.
    internal func content(_ detail: TransactionDetail) -> TransactionDetailContent {
        TransactionDetailContent(
            title: detail.description,
            amount: presentation.amount(detail.amount),
            date: presentation.date(detail.date),
            isCredit: presentation.isCredit(detail.amount),
            fields: fields(detail)
        )
    }
}

extension TransactionDetailPresentation {
    /// The lines a list row can fill in, in the order both shapes share, so the
    /// three the seed already knows do not move when the rest arrive.
    private func fields(
        type: TransactionType,
        entityName: String?,
        tags: [String]
    ) -> [TransactionDetailContent.Field] {
        [
            field(TransactionsCopy.FieldLabel.type, type.rawValue),
            field(TransactionsCopy.FieldLabel.entity, entityName),
            field(
                TransactionsCopy.FieldLabel.tags, tags.isEmpty ? nil : tags.joined(separator: ", ")),
        ]
        .compactMap { $0 }
    }

    private func fields(_ detail: TransactionDetail) -> [TransactionDetailContent.Field] {
        let shared = fields(
            type: detail.type,
            entityName: detail.entityName,
            tags: detail.tags
        )
        let rest = [
            field(TransactionsCopy.FieldLabel.account, detail.account),
            field(TransactionsCopy.FieldLabel.location, detail.location),
            field(TransactionsCopy.FieldLabel.country, detail.country),
            field(TransactionsCopy.FieldLabel.notes, detail.notes),
            field(
                TransactionsCopy.FieldLabel.lastEdited, presentation.dateTime(detail.lastEditedAt)),
        ]
        .compactMap { $0 }
        return shared + rest
    }

    /// A field, or nothing at all.
    ///
    /// Whitespace counts as nothing. Finance stores free text, and a notes
    /// column holding a single newline is not a note — it is a label with a
    /// blank beside it, which reads as the screen having failed rather than as
    /// there being nothing to say.
    private func field(_ label: String, _ value: String?) -> TransactionDetailContent.Field? {
        guard let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return nil
        }
        return TransactionDetailContent.Field(label: label, value: value)
    }
}
