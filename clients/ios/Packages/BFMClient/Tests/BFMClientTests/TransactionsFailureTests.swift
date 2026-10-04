import AppCore
import HTTPTypes
import Testing

@testable import BFMClient

/// The failure map. Five ``RepositoryError`` cases against the contract's six
/// failure statuses, and the pair that must never converge.
@Suite("BFMTransactionsRepository failures")
internal struct TransactionsFailureTests {
    private func error(
        status: HTTPResponse.Status,
        json: String
    ) async -> RepositoryError? {
        await failure {
            try await BFMTransactionsRepository
                .stubbed(StubTransport(status: status, json: json))
                .transactions(after: nil)
        }
    }

    private func failure(_ work: () async throws -> TransactionPage) async -> RepositoryError? {
        do {
            _ = try await work()
            return nil
        } catch let error as RepositoryError {
            return error
        } catch {
            return nil
        }
    }

    @Test("a rejected token ends as unauthorized, whichever way the BFM says it")
    func rejectedCredentials() async {
        let invalidToken = TransactionsWire.failure(code: "invalid_token")
        let revoked = TransactionsWire.failure(code: "device_revoked")

        #expect(await error(status: .unauthorized, json: invalidToken) == .unauthorized)
        #expect(await error(status: .forbidden, json: revoked) == .unauthorized)
    }

    /// The distinction the BFM went out of its way to keep, kept here too.
    /// "finance is not answering" is worth retrying; "finance answered
    /// something this build cannot read" is not, and the list says something
    /// different about each.
    @Test("unavailable and contract-mismatch stay separate facts")
    func upstreamDistinctionSurvives() async {
        let unavailable = await error(
            status: .serviceUnavailable,
            json: TransactionsWire.upstream(code: "gateway.upstream_unavailable")
        )
        let mismatch = await error(
            status: .badGateway,
            json: TransactionsWire.upstream(code: "gateway.upstream_contract_mismatch")
        )

        #expect(unavailable == .unavailable)
        #expect(mismatch == .contractMismatch)
        #expect(unavailable != mismatch)
    }

    @Test(
        "every upstream code lands where a screen can act on it",
        arguments: [
            ("gateway.upstream_degraded", RepositoryError.unavailable),
            ("gateway.upstream_misconfigured", RepositoryError.unavailable),
            ("gateway.upstream_conflict", RepositoryError.conflict("gateway.upstream_conflict")),
            ("not_found", RepositoryError.transport("")),
        ]
    )
    func upstreamCodes(code: String, expected: RepositoryError) async {
        let actual = await error(status: .badGateway, json: TransactionsWire.upstream(code: code))

        // Compared by shape, because `transport` carries a diagnostic string
        // that is deliberately not part of the contract this asserts.
        #expect(isTransport(actual) == isTransport(expected))
        if !isTransport(expected) { #expect(actual == expected) }
    }

    @Test("a rate limit stays distinct and carries its wait")
    func rateLimited() async {
        let actual = await error(status: .tooManyRequests, json: TransactionsWire.rateLimited)

        #expect(actual == .rateLimited(retryAfterSeconds: 30))
    }

    @Test("an unreadable rate-limit response keeps its status without inventing a wait")
    func unreadableRateLimited() async {
        let actual = await error(status: .tooManyRequests, json: "<html>slow down</html>")

        #expect(actual == .rateLimited(retryAfterSeconds: nil))
    }

    @Test("a malformed request is a defect in this build, not a dead pillar")
    func invalidRequest() async {
        let actual = await error(
            status: .badRequest,
            json: TransactionsWire.failure(code: "invalid_request")
        )

        #expect(isTransport(actual))
        #expect(actual != .unavailable)
    }

    @Test("a status the contract does not document is never mistaken for a page")
    func undocumentedStatus() async {
        let actual = await error(status: .init(code: 418), json: "{}")

        #expect(isTransport(actual))
    }

    /// A row this build cannot represent fails the page. Dropping it would
    /// leave a list quietly missing the transaction somebody is looking for.
    @Test(
        "a value this build cannot represent is a contract mismatch",
        arguments: [
            TransactionsWire.row(amountMinorUnits: 100, date: "2026-03-05T00:00:00Z"),
            TransactionsWire.row(amountMinorUnits: 100, date: "5 March 2026"),
        ]
    )
    func unrepresentableRow(json: String) async {
        let actual = await failure {
            try await BFMTransactionsRepository
                .stubbed(StubTransport(status: .ok, json: TransactionsWire.page(json)))
                .transactions(after: nil)
        }

        #expect(actual == .contractMismatch)
    }

    @Test("fractional minor units fail the generated integer decoder")
    func fractionalMinorUnitsFailDecoding() async {
        let row = """
            {"id":"txn-1","description":"Coffee","amountMinorUnits":1.5,"currency":"AUD",\
            "date":"2026-03-05","type":"purchase","entityName":"Cafe","tags":[]}
            """
        let actual = await failure {
            try await BFMTransactionsRepository
                .stubbed(StubTransport(status: .ok, json: TransactionsWire.page(row)))
                .transactions(after: nil)
        }

        #expect(isTransport(actual))
        #expect(actual != .contractMismatch)
    }

    private func isTransport(_ error: RepositoryError?) -> Bool {
        if case .transport = error { return true }
        return false
    }
}
