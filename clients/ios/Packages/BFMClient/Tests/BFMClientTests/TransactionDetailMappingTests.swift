import AppCore
import Foundation
import HTTPTypes
import Testing

@testable import BFMClient

/// The detail record's wire shape into ``TransactionDetail``, and the one
/// status on this route that is an answer rather than a failure.
@Suite("BFMTransactionsRepository detail")
internal struct TransactionDetailMappingTests {
    private func record(
        _ json: String,
        status: HTTPResponse.Status = .ok
    ) async throws -> TransactionDetail? {
        try await BFMTransactionsRepository
            .stubbed(StubTransport(status: status, json: json))
            .transactionDetail(id: "txn-1")
    }

    @Test("the record becomes a detail in the app's own vocabulary")
    func mapsEveryField() async throws {
        let detail = try #require(try await record(TransactionsWire.record))

        #expect(detail.id == "txn-1")
        #expect(detail.description == "Coffee")
        #expect(detail.amount == MoneyAmount(minorUnits: 1999, currencyCode: "AUD"))
        #expect(detail.date == (try TransactionsWire.midnight(year: 2026, month: 3, day: 5)))
        #expect(detail.type == .purchase)
        #expect(detail.account == "Everyday")
        #expect(detail.entityName == "Cafe")
        #expect(detail.entityId == "entity-1")
        #expect(detail.tags == ["food"])
        #expect(detail.location == "Surry Hills")
        #expect(detail.country == "Australia")
        #expect(detail.notes == "Before standup")
        #expect(detail.relatedTransactionId == nil)
    }

    /// The distinction this whole method exists for. A transaction deleted
    /// between a list arriving and somebody tapping it is an outcome, so it
    /// comes back as an absence — never as an error a screen would offer to
    /// retry.
    @Test("a 404 is an absence, not a failure")
    func notFoundIsAnAbsence() async throws {
        let detail = try await record(
            TransactionsWire.upstream(code: "not_found"), status: .notFound)

        #expect(detail == nil)
    }

    /// Nullable on the wire means absent in the app, not an empty string. A
    /// screen drops a field it has nothing for, and "" would draw a label with
    /// a blank beside it instead.
    @Test("the nullable fields keep their absence")
    func nullsSurviveAsNil() async throws {
        let detail = try #require(
            try await record(
                TransactionsWire.record(
                    amount: "19.99",
                    entityName: "null",
                    location: "null",
                    country: "null",
                    notes: "null"
                )))

        #expect(detail.entityName == nil)
        #expect(detail.location == nil)
        #expect(detail.country == nil)
        #expect(detail.notes == nil)
    }

    @Test("the other leg of a matched transfer is carried when finance paired one")
    func carriesTheRelatedLeg() async throws {
        let detail = try #require(
            try await record(
                TransactionsWire.record(amount: "19.99", relatedTransactionId: "\"txn-2\"")))

        #expect(detail.relatedTransactionId == "txn-2")
    }

    /// Both spellings are legitimate ISO-8601 and which one arrives is the
    /// producer's serialiser's choice. Failing the screen over a formatting
    /// detail no reader could act on would be the wrong kind of strict.
    @Test("a last-edited timestamp parses with or without fractional seconds")
    func acceptsBothTimestampSpellings() async throws {
        let withMillis = try #require(
            try await record(
                TransactionsWire.record(
                    amount: "19.99", lastEditedTime: "\"2026-03-06T04:30:00.000Z\"")))
        let withoutMillis = try #require(
            try await record(
                TransactionsWire.record(
                    amount: "19.99", lastEditedTime: "\"2026-03-06T04:30:00Z\"")))

        #expect(withMillis.lastEditedAt == withoutMillis.lastEditedAt)
    }

    /// The other half of that: tolerant of two spellings, not of anything else.
    /// A producer that started sending a bare date here would otherwise land on
    /// some arbitrary instant rather than saying it could not be read.
    @Test("a last-edited value that is not a timestamp is a contract mismatch")
    func rejectsANonTimestamp() async {
        await #expect(throws: RepositoryError.contractMismatch) {
            try await record(
                TransactionsWire.record(amount: "19.99", lastEditedTime: "\"2026-03-06\""))
        }
    }

    /// Same strictness as a list row, and for the same reason: a detail screen
    /// quietly missing the field somebody opened it for is worse than one that
    /// says it cannot read the record.
    @Test("a record this build cannot represent fails rather than half-renders")
    func rejectsAnUnreadableRecord() async {
        await #expect(throws: RepositoryError.contractMismatch) {
            try await record(TransactionsWire.record(amount: "19.99", date: "2026-03-05T00:00:00Z"))
        }
    }

    /// `type` is the one field finance is free to add to, so an unknown value
    /// has to render as itself rather than blanking the screen.
    @Test("a transaction type this build has never heard of still renders")
    func unknownTypesSurvive() async throws {
        let detail = try #require(
            try await record(TransactionsWire.record(amount: "19.99", type: "escrow")))

        #expect(detail.type == TransactionType(rawValue: "escrow"))
    }

    /// Same reasoning as the list row's equivalent case: `currency` is a
    /// plain `Swift.String`, so a value this build has never heard of still
    /// decodes rather than failing the whole record.
    @Test("a currency this build has never heard of still renders")
    func unknownCurrencyCode() async throws {
        let detail = try #require(
            try await record(TransactionsWire.record(amount: "19.99", currency: "USD")))

        #expect(detail.amount.currencyCode == "USD")
    }
}
