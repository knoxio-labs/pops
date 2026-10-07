import AppCore
import Foundation

/// Fictional data for the guest surfaces: Marta, a guest, on the phone of
/// someone Tomas shared two accounts with.
///
/// The person account is the operator's own record of Marta, so its name is
/// hers and its balance reads from his side. Both facts are deliberate: they
/// are exactly what the guest wording has to turn around.
internal enum GuestFixtures {
    internal static let owner = "Tomas"
    internal static let guestEmail = "marta@example.com"

    /// The day every staged form opens on, so a state reads the same on any
    /// date it is reviewed.
    internal static let today = Date(timeIntervalSince1970: 1_791_200_000)

    private static func date(_ interval: TimeInterval) -> Date {
        Date(timeIntervalSince1970: interval)
    }

    private static func ledgerAccount(balance: Int, count: Int) -> Account {
        Account(
            id: "acc-marta", name: "Marta", kind: .person, balance: Fixtures.money(balance),
            archived: false, contact: "Marta Ferreira", transactionCount: count)
    }

    internal static let ledger = GuestAccount(
        account: ledgerAccount(balance: 18_460, count: 6), role: .edit, owner: owner)

    internal static let ledgerOwedToGuest = GuestAccount(
        account: ledgerAccount(balance: -4_150, count: 4), role: .edit, owner: owner)

    internal static let ledgerSettled = GuestAccount(
        account: ledgerAccount(balance: 0, count: 0), role: .edit, owner: owner)

    internal static let ledgerViewOnly = GuestAccount(
        account: ledger.account, role: .view, owner: owner)

    internal static let household = GuestAccount(
        account: Account(
            id: "acc-household", name: "Household bills", kind: .shared,
            balance: Fixtures.money(64_215), archived: false, institutionName: "Up",
            balanceAsOf: date(1_791_000_000), transactionCount: 212),
        role: .view, owner: owner)

    /// The same account at the edit role, for the one form state that needs
    /// a second account to choose between.
    internal static let householdEditable = GuestAccount(
        account: household.account, role: .edit, owner: owner)

    internal static let accounts: [GuestAccount] = [ledger, household]

    internal static let photoReceipt = GuestAttachment(
        id: "att-harris-farm", name: "Harris Farm receipt", media: .photo, pages: paper(1))

    internal static let pdfReceipt = GuestAttachment(
        id: "att-tickets", name: "Ticket invoice.pdf", media: .pdf, pages: paper(3))

    internal static let loadingReceipt = GuestAttachment(
        id: "att-loading", name: "Harris Farm receipt", media: .photo, pages: [],
        availability: .loading)

    internal static let failedReceipt = GuestAttachment(
        id: "att-failed", name: "Harris Farm receipt", media: .photo, pages: [],
        availability: .failed)

    internal static func paper(_ pages: Int) -> [Data] {
        ReceiptPlaygroundPaper.pages(pages).map(\.data)
    }

    internal static let groceries = entry(
        "txn-groceries", "Groceries, Harris Farm", 8_412, 1_791_050_000, .refund,
        attachments: [photoReceipt])

    internal static let tickets = entry(
        "txn-tickets", "Concert tickets", 24_000, 1_790_700_000, .refund,
        attachments: [photoReceipt, pdfReceipt])

    internal static let dinner = entry(
        "txn-dinner", "Dinner at Bar Lucia", -6_200, 1_790_900_000, .purchase)

    internal static let ledgerEntries: [GuestEntry] = [
        groceries,
        dinner,
        entry("txn-repayment", "Bank transfer", -15_000, 1_790_800_000, .transfer),
        tickets,
        entry("txn-pharmacy", "Pharmacy", -2_352, 1_790_400_000, .purchase),
        entry("txn-taxi", "Airport taxi", 9_600, 1_790_100_000, .refund),
    ]

    internal static let householdEntries: [GuestEntry] = [
        entry(
            "txn-power", "Electricity, September", -18_640, 1_790_950_000, .purchase,
            account: household),
        entry("txn-water", "Water rates", -9_215, 1_790_500_000, .purchase, account: household),
        entry("txn-top-up", "Monthly top up", 60_000, 1_790_000_000, .transfer, account: household),
    ]

    internal static func entries(for account: GuestAccount) -> [GuestEntry] {
        account.id == household.id ? householdEntries : ledgerEntries
    }

    private static func entry(
        _ id: String, _ description: String, _ minorUnits: Int, _ when: TimeInterval,
        _ type: TransactionType, account: GuestAccount = ledger,
        attachments: [GuestAttachment] = []
    ) -> GuestEntry {
        GuestEntry(
            id: id, accountID: account.id, description: description,
            amount: Fixtures.money(minorUnits), date: date(when), type: type,
            attachments: attachments)
    }

    internal static let receiptSuggestion = GuestReceiptSuggestion(
        date: date(1_791_050_000), description: "Harris Farm Markets",
        total: Fixtures.money(8_412))

    /// A reading that found the shop and the total and not the date.
    internal static let partialSuggestion = GuestReceiptSuggestion(
        date: nil, description: "Harris Farm Markets", total: Fixtures.money(8_412))

    /// A receipt from a trip, read correctly, in a currency the account does
    /// not hold.
    internal static let foreignSuggestion = GuestReceiptSuggestion(
        date: date(1_790_300_000), description: "Pastelaria Santo Antonio",
        total: Fixtures.money(4_190, "EUR"))
}

extension GuestFixtures {
    internal static let ticketsHistory: [GuestHistoryEvent] = [
        GuestHistoryEvent(
            id: "evt-tickets-3", entryID: tickets.id, subject: tickets.description,
            action: .updated, actor: .you, at: date(1_790_990_000),
            changes: [
                GuestFieldChange(field: "Amount", before: "A$220.00", after: "A$240.00"),
                GuestFieldChange(field: "Date", before: "29 Sept 2026", after: "30 Sept 2026"),
            ]),
        GuestHistoryEvent(
            id: "evt-tickets-2", entryID: tickets.id, subject: tickets.description,
            action: .updated, actor: .other(owner), at: date(1_790_800_000),
            changes: [
                GuestFieldChange(field: "Description", before: "Tickets", after: "Concert tickets")
            ]),
        GuestHistoryEvent(
            id: "evt-tickets-1", entryID: tickets.id, subject: tickets.description,
            action: .created, actor: .other(owner), at: date(1_790_700_000)),
    ]

    internal static let createdOnly: [GuestHistoryEvent] = [
        GuestHistoryEvent(
            id: "evt-dinner-1", entryID: dinner.id, subject: dinner.description,
            action: .created, actor: .you, at: date(1_790_900_000))
    ]

    internal static let ledgerActivity: [GuestHistoryEvent] = [
        GuestHistoryEvent(
            id: "evt-groceries-1", entryID: groceries.id, subject: groceries.description,
            action: .created, actor: .other(owner), at: date(1_791_050_000)),
        ticketsHistory[0],
        GuestHistoryEvent(
            id: "evt-parking-2", entryID: "txn-parking", subject: "Parking",
            action: .deleted, actor: .other(owner), at: date(1_790_960_000)),
        createdOnly[0],
        GuestHistoryEvent(
            id: "evt-lunch-3", entryID: "txn-lunch", subject: "Lunch",
            action: .restored, actor: .other(owner), at: date(1_790_850_000)),
        GuestHistoryEvent(
            id: "evt-lunch-2", entryID: "txn-lunch", subject: "Lunch",
            action: .deleted, actor: .you, at: date(1_790_840_000)),
        ticketsHistory[1],
        ticketsHistory[2],
    ]
}
