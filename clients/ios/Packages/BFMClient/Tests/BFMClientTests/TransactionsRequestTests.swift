import AppCore
import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing

@testable import BFMClient

/// What leaves the device, what a stale cursor does, and what a call that never
/// completed is allowed to say about itself.
@Suite("BFMTransactionsRepository requests")
internal struct TransactionsRequestTests {
    @Test("the first page asks for no cursor at the contract's path")
    func firstPageTargetsTheContractsPath() async throws {
        let transport = StubTransport(status: .ok, json: TransactionsWire.page())
        _ = try await BFMTransactionsRepository.stubbed(transport).transactions(after: nil)

        let sent = try #require(await transport.recorded.all.first)
        #expect(sent.request.method == .get)
        #expect(sent.request.path == "/mobile/finance/transactions")
        #expect(sent.operationID == "mobileFinance.listTransactions")
    }

    @Test("a detail fetch addresses the row by id at the contract's path")
    func detailTargetsTheContractsPath() async throws {
        let transport = StubTransport(status: .ok, json: TransactionsWire.record)
        _ = try await BFMTransactionsRepository.stubbed(transport).transactionDetail(id: "txn-1")

        let sent = try #require(await transport.recorded.all.first)
        #expect(sent.request.method == .get)
        #expect(sent.request.path == "/mobile/finance/transactions/txn-1")
        #expect(sent.operationID == "mobileFinance.getTransaction")
    }

    /// Finance's ids are opaque and this app never constructs one, so an id
    /// carrying a character that means something in a URL has to survive as
    /// data. Unencoded, `a/b` addresses a different route entirely and the
    /// screen reports whatever that route happens to say.
    @Test("an id carrying URL syntax is escaped rather than becoming path")
    func detailEscapesTheID() async throws {
        let transport = StubTransport(status: .ok, json: TransactionsWire.record)
        _ = try await BFMTransactionsRepository.stubbed(transport)
            .transactionDetail(id: "a/b c")

        let sent = try #require(await transport.recorded.all.first)
        #expect(sent.request.path == "/mobile/finance/transactions/a%2Fb%20c")
    }

    @Test("a next page carries the server's cursor and nothing derived from it")
    func nextPageCarriesTheCursor() async throws {
        let transport = StubTransport(status: .ok, json: TransactionsWire.page())
        _ = try await BFMTransactionsRepository.stubbed(transport).transactions(after: "abc123")

        let sent = try #require(await transport.recorded.all.first)
        #expect(sent.request.path == "/mobile/finance/transactions?cursor=abc123")
    }

    /// The server's own instruction — "start the list again" — carried out
    /// rather than reported. The caller merges by id, so a first page it has
    /// already seen costs nothing and paging resumes against a cursor that
    /// works.
    @Test("a cursor the server disowns restarts the list instead of failing")
    func staleCursorRestarts() async throws {
        let transport = StubTransport { request, _ in
            let isRetry = request.path?.contains("cursor=") != true
            return (
                HTTPResponse(
                    status: isRetry ? .ok : .badRequest,
                    headerFields: [.contentType: "application/json"]
                ),
                HTTPBody(
                    isRetry
                        ? TransactionsWire.page(TransactionsWire.row)
                        : TransactionsWire.failure(code: "invalid_cursor")
                )
            )
        }

        let page = try await BFMTransactionsRepository.stubbed(transport)
            .transactions(after: "stale")

        #expect(page.transactions.count == 1)
        let paths = await transport.recorded.all.compactMap(\.request.path)
        #expect(
            paths == ["/mobile/finance/transactions?cursor=stale", "/mobile/finance/transactions"])
    }

    /// The restart cannot itself be restarted. The BFM only rejects a cursor it
    /// was given, so a first page answering `invalid_cursor` is the server
    /// contradicting its own contract — reported, not retried forever.
    @Test("a first page told its absent cursor is invalid does not loop")
    func staleCursorOnFirstPageIsNotRetried() async {
        let transport = StubTransport(
            status: .badRequest,
            json: TransactionsWire.failure(code: "invalid_cursor")
        )

        await #expect(throws: RepositoryError.contractMismatch) {
            try await BFMTransactionsRepository.stubbed(transport).transactions(after: nil)
        }

        #expect(await transport.recorded.all.count == 1)
    }

    /// The generated deserializer decodes eagerly, so a documented status
    /// carrying a body it cannot read — the HTML page an intermediary returns —
    /// never reaches the response switch. The status is the actionable half and
    /// it survives.
    @Test("a documented status with an unreadable body keeps its meaning")
    func documentedStatusWithHTMLBody() async {
        let html = "<html><body>Forbidden</body></html>"

        await #expect(throws: RepositoryError.unauthorized) {
            try await BFMTransactionsRepository
                .stubbed(StubTransport(status: .forbidden, json: html))
                .transactions(after: nil)
        }
        await #expect(throws: RepositoryError.unavailable) {
            try await BFMTransactionsRepository
                .stubbed(StubTransport(status: .serviceUnavailable, json: html))
                .transactions(after: nil)
        }
    }

    /// `ClientError`'s own description renders the operation's typed input and
    /// every request header by reflection. Nothing this repository throws may
    /// carry either, and the cursor is the one input value that is easy to
    /// check for.
    @Test("a call that never completed reports the failure and none of the request")
    func transportFailureCarriesNothingSent() async throws {
        struct Dead: Error {}
        let transport = StubTransport { _, _ in throw Dead() }

        let thrown = await #expect(throws: RepositoryError.self) {
            try await BFMTransactionsRepository.stubbed(transport)
                .transactions(after: "a-secret-looking-cursor")
        }

        guard case .transport(let diagnostic) = try #require(thrown) else {
            Issue.record("expected a transport failure, got \(String(describing: thrown))")
            return
        }
        #expect(diagnostic.contains("mobileFinance.listTransactions"))
        #expect(!diagnostic.contains("a-secret-looking-cursor"))
    }
}
