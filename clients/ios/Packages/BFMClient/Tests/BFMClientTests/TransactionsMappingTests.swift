import AppCore
import Foundation
import Testing

@testable import BFMClient

/// Wire row to ``Transaction``, field by field. Every leg here is one where a
/// wrong answer is silent: a cent lost in a float, a day lost to a time zone, a
/// transaction type an older build has never heard of.
@Suite("BFMTransactionsRepository mapping")
internal struct TransactionsMappingTests {
    private func page(_ json: String) async throws -> TransactionPage {
        try await BFMTransactionsRepository
            .stubbed(StubTransport(status: .ok, json: json))
            .transactions(after: nil)
    }

    private func onlyRow(_ json: String) async throws -> Transaction {
        try #require(try await page(TransactionsWire.page(json)).transactions.first)
    }

    @Test("a row becomes a transaction in the app's own vocabulary")
    func mapsEveryField() async throws {
        let transaction = try await onlyRow(TransactionsWire.row)

        #expect(transaction.id == "txn-1")
        #expect(transaction.description == "Coffee")
        #expect(transaction.amount == MoneyAmount(minorUnits: 1999, currencyCode: "AUD"))
        #expect(transaction.date == (try TransactionsWire.midnight(year: 2026, month: 3, day: 5)))
        #expect(transaction.type == .purchase)
        #expect(transaction.entityName == "Cafe")
        #expect(transaction.tags == ["food"])
    }

    @Test("the page carries the server's cursor, opaque and underived")
    func carriesTheCursor() async throws {
        let page = try await page(
            TransactionsWire.page(TransactionsWire.row, nextCursor: "\"eyJkIjoiMjAyNiJ9\"")
        )

        #expect(page.nextCursor == "eyJkIjoiMjAyNiJ9")
    }

    @Test("a null cursor is the last page")
    func lastPageHasNoCursor() async throws {
        #expect(try await page(TransactionsWire.page(TransactionsWire.row)).nextCursor == nil)
    }

    @Test("an empty page is an empty page, not a failure")
    func emptyPage() async throws {
        let page = try await page(TransactionsWire.page())

        #expect(page.transactions.isEmpty)
        #expect(page.nextCursor == nil)
    }

    /// The values a `Double` cannot hold exactly, which is most of them.
    /// `Int(19.99 * 100)` is 1998, and every one of these would be off by a
    /// cent through the obvious conversion.
    @Test(
        "amounts survive the wire's float exactly",
        arguments: [
            ("19.99", 1999), ("0.07", 7), ("-19.99", -1999), ("-0.01", -1),
            ("0", 0), ("1234567.89", 123_456_789), ("-98765.43", -9_876_543),
        ]
    )
    func amountsAreExact(wire: String, minorUnits: Int) async throws {
        let transaction = try await onlyRow(TransactionsWire.row(amount: wire))

        #expect(transaction.amount == MoneyAmount(minorUnits: minorUnits, currencyCode: "AUD"))
    }

    /// The sign is the server's. A screen colours a row by it, so re-deriving
    /// it from the transaction type here would be a second opinion that can
    /// disagree with the first.
    @Test("the sign is carried through, not inferred from the type")
    func signIsCarried() async throws {
        let credit = try await onlyRow(TransactionsWire.row(amount: "42.50", type: "purchase"))
        let debit = try await onlyRow(TransactionsWire.row(amount: "-42.50", type: "income"))

        #expect(credit.amount.minorUnits == 4250)
        #expect(debit.amount.minorUnits == -4250)
    }

    /// The whole reason ``TransactionType`` is a raw-value wrapper rather than
    /// an enum: this build is on a phone somebody else owns, and the finance
    /// pillar can add a type tomorrow.
    @Test("a transaction type this build has never heard of still renders")
    func unknownTransactionType() async throws {
        let transaction = try await onlyRow(TransactionsWire.row(amount: "1.00", type: "escrow"))

        #expect(transaction.type == TransactionType(rawValue: "escrow"))
    }

    @Test("a row with no entity keeps the absence rather than inventing a name")
    func missingEntityName() async throws {
        let json = """
            {"id":"t","description":"d","amount":1,"currency":"AUD","date":"2026-03-05",\
            "type":"purchase","entityName":null,"tags":[]}
            """

        #expect(try await onlyRow(json).entityName == nil)
    }

    /// Date-only, read in the device's zone so the day the server named is the
    /// day the row shows. Parsed in UTC it would be 11 hours early here, which
    /// renders as the same date in Sydney and the previous one in Los Angeles.
    @Test("a date-only value lands on midnight in the reader's own zone")
    func dateIsReadInTheGivenZone() async throws {
        let transaction = try await onlyRow(TransactionsWire.row(amount: "1", date: "2026-01-01"))

        #expect(transaction.date == (try TransactionsWire.midnight(year: 2026, month: 1, day: 1)))
    }
}
