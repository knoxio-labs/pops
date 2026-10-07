import AppCore
import Foundation

/// What the operator let a guest do with one account.
internal enum GuestRole: String, Hashable, Sendable {
    case view
    case edit
}

/// One account as a guest holds it: the account, the role it was shared at,
/// and the name of the person who shared it.
///
/// `owner` is carried here because a person account is named after the guest
/// on the operator's side, so the guest's own screen has to title it with the
/// other party instead.
internal struct GuestAccount: Hashable, Sendable, Identifiable {
    internal let account: Account
    internal let role: GuestRole
    internal let owner: String

    internal var id: Account.ID { account.id }
    internal var isPersonLedger: Bool { account.kind == .person }
    internal var canEdit: Bool { role == .edit }
}

/// A file attached to a ledger entry: one photo, or a document of several
/// pages. `pages` holds what the viewer draws, one image per page.
internal struct GuestAttachment: Hashable, Sendable, Identifiable {
    internal enum Media: Hashable, Sendable {
        case photo
        case pdf
    }

    internal enum Availability: Hashable, Sendable {
        case ready
        case loading
        case failed
    }

    internal let id: String
    internal let name: String
    internal let media: Media
    internal let pages: [Data]
    internal let availability: Availability

    internal init(
        id: String, name: String, media: Media, pages: [Data],
        availability: Availability = .ready
    ) {
        self.id = id
        self.name = name
        self.media = media
        self.pages = pages
        self.availability = availability
    }
}

/// One ledger row. `amount` keeps the ledger's own sign, which on a person
/// account reads from the operator's side: positive raises what the guest
/// owes.
internal struct GuestEntry: Hashable, Sendable, Identifiable {
    internal let id: String
    internal let accountID: Account.ID
    internal let description: String
    internal let amount: MoneyAmount
    internal let date: Date
    internal let type: TransactionType
    internal let attachments: [GuestAttachment]

    internal init(
        id: String, accountID: Account.ID, description: String, amount: MoneyAmount, date: Date,
        type: TransactionType, attachments: [GuestAttachment] = []
    ) {
        self.id = id
        self.accountID = accountID
        self.description = description
        self.amount = amount
        self.date = date
        self.type = type
        self.attachments = attachments
    }
}

/// The choice a guest makes in the form's Type row. Each one fixes both the
/// stored transaction type and the sign, so the amount is always typed as a
/// plain positive figure.
internal struct GuestEntryKind: Hashable, Sendable, Identifiable {
    internal let id: String
    internal let type: TransactionType
    internal let raisesBalance: Bool

    internal static let paidForOwner = GuestEntryKind(
        id: "paid-for-owner", type: .purchase, raisesBalance: false)
    internal static let ownerPaidForMe = GuestEntryKind(
        id: "owner-paid-for-me", type: .refund, raisesBalance: true)
    internal static let repaidOwner = GuestEntryKind(
        id: "repaid-owner", type: .transfer, raisesBalance: false)
    internal static let ownerRepaidMe = GuestEntryKind(
        id: "owner-repaid-me", type: .transfer, raisesBalance: true)

    internal static let purchase = GuestEntryKind(
        id: "purchase", type: .purchase, raisesBalance: false)
    internal static let refund = GuestEntryKind(id: "refund", type: .refund, raisesBalance: true)
    internal static let income = GuestEntryKind(id: "income", type: .income, raisesBalance: true)
    internal static let transferOut = GuestEntryKind(
        id: "transfer-out", type: .transfer, raisesBalance: false)
    internal static let transferIn = GuestEntryKind(
        id: "transfer-in", type: .transfer, raisesBalance: true)

    internal static let personLedger: [GuestEntryKind] = [
        .paidForOwner, .ownerPaidForMe, .repaidOwner, .ownerRepaidMe,
    ]

    internal static let ordinary: [GuestEntryKind] = [
        .purchase, .refund, .income, .transferOut, .transferIn,
    ]

    internal static func options(for account: GuestAccount) -> [GuestEntryKind] {
        account.isPersonLedger ? personLedger : ordinary
    }

    /// The option an existing row opens the form on. `nil` when the row holds
    /// a type or a sign the form does not offer, which leaves Type unchosen
    /// instead of silently restating the row as something else.
    internal static func matching(_ entry: GuestEntry, in account: GuestAccount) -> GuestEntryKind?
    {
        guard entry.amount.minorUnits != 0 else { return nil }
        let raises = entry.amount.minorUnits > 0
        return options(for: account).first { $0.type == entry.type && $0.raisesBalance == raises }
    }

    internal func signed(_ magnitude: MoneyAmount) -> MoneyAmount {
        let size = abs(magnitude.minorUnits)
        return MoneyAmount(
            minorUnits: raisesBalance ? size : -size, currencyCode: magnitude.currencyCode)
    }
}
