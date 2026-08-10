import Foundation
import Testing

@testable import BFMClient

/// The bodies `GET /mobile/finance/transactions` can answer with, written as
/// the JSON the BFM actually sends rather than built through the generated
/// types.
///
/// Constructing a generated `JsonPayload` and re-encoding it would test the
/// mapping against this suite's own idea of the wire; these strings are copied
/// from the contract, so a field renamed on the producer's side fails here.
internal enum TransactionsWire {
    /// One row, with every field at a value that is uninteresting on its own.
    internal static let row = row(amount: "19.99")

    internal static func row(
        id: String = "txn-1",
        amount: String,
        date: String = "2026-03-05",
        type: String = "purchase"
    ) -> String {
        """
        {"id":"\(id)","description":"Coffee","amount":\(amount),"currency":"AUD",\
        "date":"\(date)","type":"\(type)","entityName":"Cafe","tags":["food"]}
        """
    }

    internal static func page(_ rows: String..., nextCursor: String = "null") -> String {
        """
        {"data":[\(rows.joined(separator: ","))],"nextCursor":\(nextCursor)}
        """
    }

    internal static func failure(code: String, message: String = "no") -> String {
        """
        {"code":"\(code)","message":"\(message)"}
        """
    }

    internal static func upstream(code: String) -> String {
        """
        {"code":"\(code)","pillar":"finance","retryable":true,"message":"no"}
        """
    }

    internal static let rateLimited = """
        {"code":"rate_limited","message":"slow down","retryAfterSeconds":30}
        """
}

extension BFMTransactionsRepository {
    /// A repository over a stubbed transport, in the one time zone every date
    /// assertion in these suites is written against.
    internal static func stubbed(_ transport: StubTransport) throws -> BFMTransactionsRepository {
        BFMTransactionsRepository(
            client: BFMHTTPClient(
                baseURL: try #require(URL(string: "https://bfm.example")),
                transport: transport
            ),
            timeZone: { TransactionsWire.timeZone }
        )
    }
}

extension TransactionsWire {
    /// Deliberately not UTC. A date-only value read in the wrong zone lands on
    /// the right instant only when the offset is zero, so a suite pinned to UTC
    /// would pass against a repository that ignored the zone entirely.
    internal static let timeZone = TimeZone(identifier: "Australia/Sydney") ?? .gmt

    /// Midnight on the given day, in that zone.
    internal static func midnight(year: Int, month: Int, day: Int) throws -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return try #require(
            calendar.date(from: DateComponents(year: year, month: month, day: day))
        )
    }
}
