import AppCore
import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing

@testable import BFMClient

@Suite("BFMAccountsRepository requests")
internal struct AccountsRequestTests {
    @Test("the first page targets the account route without a cursor")
    func firstPageTargetsAccountsRoute() async throws {
        let transport = StubTransport(status: .ok, json: AccountsWire.page())
        _ = try await BFMAccountsRepository.stubbed(transport).accountPage(
            search: nil, archived: false, cursor: nil, limit: 25)

        let sent = try #require(await transport.recorded.all.first)
        #expect(sent.request.method == .get)
        #expect(sent.request.path == "/mobile/finance/accounts?archived=false&limit=25")
        #expect(sent.operationID == "mobileFinance.listAccounts")
    }

    @Test("search, archive scope, cursor, and limit reach the server")
    func pageFiltersAreMappedToQuery() async throws {
        let transport = StubTransport(status: .ok, json: AccountsWire.page())
        _ = try await BFMAccountsRepository.stubbed(transport).accountPage(
            search: "Home loan", archived: true, cursor: "opaque cursor", limit: 25)

        let sent = try #require(await transport.recorded.all.first)
        #expect(sent.request.path?.hasPrefix("/mobile/finance/accounts?") == true)
        #expect(
            query(of: sent.request) == [
                "search": "Home loan",
                "archived": "true",
                "cursor": "opaque cursor",
                "limit": "25",
            ])
    }

    @Test("an unscoped archive query leaves archived omitted")
    func includesBothArchiveScopes() async throws {
        let transport = StubTransport(status: .ok, json: AccountsWire.page())
        _ = try await BFMAccountsRepository.stubbed(transport).accountPage(
            search: nil, archived: nil, cursor: nil, limit: 25)

        let sent = try #require(await transport.recorded.all.first)
        #expect(query(of: sent.request) == ["limit": "25"])
    }

    @Test("the all-accounts compatibility method follows every page and deduplicates ids")
    func allAccountsConsumesPages() async throws {
        let transport = StubTransport { request, _ in
            let secondPage = request.path?.contains("cursor=next") == true
            return (
                HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]),
                HTTPBody(
                    secondPage
                        ? AccountsWire.page(
                            AccountsWire.account(id: "acc-1"), AccountsWire.account(id: "acc-2"))
                        : AccountsWire.page(AccountsWire.account(id: "acc-1"), nextCursor: "next")
                )
            )
        }

        let accounts = try await BFMAccountsRepository.stubbed(transport).accounts()

        #expect(accounts.map(\.id) == ["acc-1", "acc-2"])
        let requests = await transport.recorded.all
        #expect(requests.count == 2)
        #expect(query(of: try #require(requests.first?.request)) == ["limit": "100"])
        #expect(
            query(of: try #require(requests.last?.request)) == [
                "cursor": "next",
                "limit": "100",
            ])
    }

    @Test("a stale cursor restarts the same filtered page")
    func staleCursorRestartsSameQuery() async throws {
        let transport = StubTransport { request, _ in
            let rejected = request.path?.contains("cursor=stale") == true
            return (
                HTTPResponse(
                    status: rejected ? .badRequest : .ok,
                    headerFields: [.contentType: "application/json"]
                ),
                HTTPBody(
                    rejected
                        ? AccountsWire.failure(code: "invalid_cursor")
                        : AccountsWire.page(AccountsWire.account(), nextCursor: "fresh")
                )
            )
        }

        let page = try await BFMAccountsRepository.stubbed(transport).accountPage(
            search: "Home loan", archived: false, cursor: "stale", limit: 25)

        #expect(page.accounts.map(\.id) == ["acc-1"])
        #expect(page.nextCursor == "fresh")
        let requests = await transport.recorded.all
        #expect(requests.count == 2)
        #expect(
            query(of: try #require(requests.first?.request)) == [
                "search": "Home loan",
                "archived": "false",
                "cursor": "stale",
                "limit": "25",
            ])
        #expect(
            query(of: try #require(requests.last?.request)) == [
                "search": "Home loan",
                "archived": "false",
                "limit": "25",
            ])
    }

    @Test("a first page cannot restart when the server rejects its absent cursor")
    func invalidCursorOnFirstPageIsContractMismatch() async {
        let transport = StubTransport(
            status: .badRequest, json: AccountsWire.failure(code: "invalid_cursor"))

        await #expect(throws: RepositoryError.contractMismatch) {
            try await BFMAccountsRepository.stubbed(transport).accountPage(
                search: nil, archived: false, cursor: nil, limit: 25)
        }
        #expect(await transport.recorded.all.count == 1)
    }

    private func query(of request: HTTPRequest) -> [String: String] {
        let path = request.path ?? ""
        let components = URLComponents(string: "https://bfm.example\(path)")
        var values: [String: String] = [:]
        for item in components?.queryItems ?? [] {
            if let value = item.value { values[item.name] = value }
        }
        return values
    }
}
