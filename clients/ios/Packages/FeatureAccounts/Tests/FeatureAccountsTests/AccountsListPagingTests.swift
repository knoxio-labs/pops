import AppCore
import AppCoreFakes
import Testing

@testable import FeatureAccounts

@MainActor
@Suite("Accounts list paging")
internal struct AccountsListPagingTests {
    @Test("the first request is bounded and the next request uses its cursor")
    func firstPageAndNextPage() async throws {
        let rows = Account.fakes(count: 30)
        let repository = InMemoryAccountsRepository(rows: rows)
        let model = model(repository)

        await model.loadAccounts()

        guard case .loaded(let firstPage) = model.state else {
            Issue.record("Expected the first page to load")
            return
        }
        #expect(firstPage.count == 25)
        #expect(model.paging == .idle)
        let firstRequests = await repository.pageRequests
        #expect(firstRequests.count == 1)
        #expect(firstRequests[0].limit == 25)
        #expect(firstRequests[0].cursor == nil)

        await model.loadNextPageIfNeeded()

        guard case .loaded(let loaded) = model.state else {
            Issue.record("Expected both pages to remain visible")
            return
        }
        #expect(loaded == rows)
        #expect(model.paging == .exhausted)
        #expect(await repository.pageRequests.count == 2)
    }

    @Test("search and archive scope are applied before the page limit")
    func queryAndScopeBeforeLimit() async throws {
        let target = Account.fake(
            id: "matching-account",
            name: "Shared reserve",
            kind: .savings,
            archived: false
        )
        let archivedMatch = Account.fake(
            id: "archived-match",
            name: "Shared archive",
            kind: .savings,
            archived: true
        )
        let repository = InMemoryAccountsRepository(
            rows: Account.fakes(count: 40) + [target, archivedMatch])
        let model = model(repository)
        model.searchText = "shared"

        await model.loadAccounts()

        #expect(model.state == .loaded([target]))
        #expect(model.totalCount == 1)
        let firstRequest = await repository.pageRequests.first
        #expect(firstRequest?.search == "shared")
        #expect(firstRequest?.archiveScope == .active)
        #expect(firstRequest?.limit == 25)
    }

    @Test("a limit larger than the available rows safely returns the whole page")
    func veryLargePageLimit() async throws {
        let account = Account.fake(id: "single-account")
        let repository = InMemoryAccountsRepository(rows: [account])

        let page = try await repository.accountPage(
            search: nil, archiveScope: .all, cursor: nil, limit: .max)

        #expect(page.accounts == [account])
        #expect(page.nextCursor == nil)
    }

    @Test("legacy repositories page their matching rows before applying the limit")
    func legacyRepositoryUsesDefaultPageImplementation() async throws {
        let first = Account.fake(id: "first", name: "Shared first")
        let second = Account.fake(id: "second", name: "Shared second")
        let archived = Account.fake(id: "archived", name: "Shared archived", archived: true)
        let repository = LegacyAccountsRepository(rows: [first, second, archived])

        let firstPage = try await repository.accountPage(
            search: "shared", archiveScope: .active, cursor: nil, limit: 1)
        let cursor = try #require(firstPage.nextCursor)
        let secondPage = try await repository.accountPage(
            search: "shared", archiveScope: .active, cursor: cursor, limit: 1)

        #expect(firstPage.accounts == [first])
        #expect(firstPage.totalCount == 2)
        #expect(secondPage.accounts == [second])
        #expect(secondPage.nextCursor == nil)
    }

    @Test("showing archived accounts removes the server archive filter")
    func archivedScopeIncludesBothKinds() async {
        let active = Account.fake(id: "active", archived: false)
        let archived = Account.fake(id: "archived", archived: true)
        let repository = InMemoryAccountsRepository(rows: [active, archived])
        let model = model(repository)
        model.showArchived = true

        await model.loadAccounts()

        #expect(model.state == .loaded([active, archived]))
        #expect(model.sections.archived == [archived])
        #expect(await repository.pageRequests.first?.archiveScope == .all)
    }

    @Test("a search with no matches differs from an empty account set")
    func noMatchesAndEmptySet() async {
        let repository = InMemoryAccountsRepository(rows: Account.fakes(count: 2))
        let model = model(repository)
        model.searchText = "missing"

        await model.loadAccounts()

        #expect(model.state == .loaded([]))
        #expect(model.sections.isEmpty)

        let emptyModel = self.model(InMemoryAccountsRepository(rows: []))
        await emptyModel.loadAccounts()
        #expect(emptyModel.state == .empty)
    }

    @Test("a failed next page keeps the first page and retries its cursor")
    func failedPageRetry() async throws {
        let rows = Account.fakes(count: 30)
        let repository = InMemoryAccountsRepository(rows: rows)
        let model = model(repository)
        await model.loadAccounts()
        await repository.fail(with: .unavailable)
        await model.loadNextPageIfNeeded()

        guard case .loaded(let retainedRows) = model.state else {
            Issue.record("A tail failure must preserve the first page")
            return
        }
        #expect(retainedRows.count == 25)
        #expect(model.paging == .failed(.unavailable))

        let failedCursor = try #require(await repository.pageRequests.last?.cursor)
        await repository.fail(with: nil)
        await model.retryNextPage()

        guard case .loaded(let recoveredRows) = model.state else {
            Issue.record("Retry should append the remaining accounts")
            return
        }
        #expect(recoveredRows == rows)
        let retryRequest = await repository.pageRequests.last
        #expect(retryRequest?.cursor == failedCursor)
    }

    @Test("overlapping and duplicate rows in one page are appended once")
    func deduplicatesBoundaryRows() async {
        let first = Account.fake(id: "account-1")
        let second = Account.fake(id: "account-2")
        let third = Account.fake(id: "account-3")
        let repository = RepeatedPageAccountsRepository(
            firstPage: AccountsPage(accounts: [first, second], nextCursor: "next"),
            nextPage: AccountsPage(accounts: [second, third, third], nextCursor: nil)
        )
        let model = model(repository)

        await model.loadAccounts()
        await model.loadNextPageIfNeeded()

        #expect(model.state == .loaded([first, second, third]))
    }

    @Test("a changed search ignores a late response from the previous query")
    func changedSearchSupersedesOldResponse() async {
        let stale = Account.fake(id: "stale", name: "Slow match")
        let current = Account.fake(id: "current", name: "Fast match")
        let repository = ControlledAccountsRepository(
            delayedSearch: "slow",
            delayedPage: AccountsPage(accounts: [stale], nextCursor: nil),
            currentPage: AccountsPage(accounts: [current], nextCursor: nil)
        )
        let model = model(repository)
        model.searchText = "slow"
        let slowLoad = Task { await model.loadAccounts() }
        await repository.waitForSearch("slow")

        model.searchText = "fast"
        await model.loadAccounts()
        await repository.releaseDelayedSearch()
        await slowLoad.value

        #expect(model.state == .loaded([current]))
    }

    @Test("a repeated cursor stops with a retryable contract failure")
    func repeatedCursorStopsPaging() async {
        let account = Account.fake(id: "account-1")
        let repository = RepeatedPageAccountsRepository(
            firstPage: AccountsPage(accounts: [account], nextCursor: "next"),
            nextPage: AccountsPage(accounts: [account], nextCursor: "next")
        )
        let model = model(repository)

        await model.loadAccounts()
        await model.loadNextPageIfNeeded()

        #expect(model.state == .loaded([account]))
        #expect(model.paging == .failed(.contractMismatch))
        #expect(model.pageFailure == .contractMismatch)
    }

    private func model(_ repository: any AccountsRepository) -> AccountsListViewModel {
        AccountsListViewModel(dependencies: .fake(accounts: repository), router: Router())
    }
}

private actor RepeatedPageAccountsRepository: AccountsRepository {
    private let firstPage: AccountsPage
    private let nextPage: AccountsPage

    init(firstPage: AccountsPage, nextPage: AccountsPage) {
        self.firstPage = firstPage
        self.nextPage = nextPage
    }

    func accounts() async throws -> [Account] { firstPage.accounts }

    func accountPage(
        search: String?,
        archiveScope: AccountsArchiveScope,
        cursor: String?,
        limit: Int
    ) async throws -> AccountsPage {
        return cursor == nil ? firstPage : nextPage
    }

    func accountDetail(id: Account.ID) async throws -> AccountDetail? { nil }
}

private actor LegacyAccountsRepository: AccountsRepository {
    private let rows: [Account]

    init(rows: [Account]) {
        self.rows = rows
    }

    func accounts() async throws -> [Account] { rows }

    func accountDetail(id: Account.ID) async throws -> AccountDetail? { nil }
}

private actor ControlledAccountsRepository: AccountsRepository {
    private let delayedSearch: String
    private let delayedPage: AccountsPage
    private let currentPage: AccountsPage
    private var delayedContinuation: CheckedContinuation<AccountsPage, Never>?
    private var requestWaiter: CheckedContinuation<Void, Never>?
    private var delayedRequestStarted = false

    init(delayedSearch: String, delayedPage: AccountsPage, currentPage: AccountsPage) {
        self.delayedSearch = delayedSearch
        self.delayedPage = delayedPage
        self.currentPage = currentPage
    }

    func accounts() async throws -> [Account] { [] }

    func accountPage(
        search: String?,
        archiveScope: AccountsArchiveScope,
        cursor: String?,
        limit: Int
    ) async throws -> AccountsPage {
        guard search == delayedSearch else { return currentPage }
        return await withCheckedContinuation { continuation in
            delayedContinuation = continuation
            delayedRequestStarted = true
            requestWaiter?.resume()
            requestWaiter = nil
        }
    }

    func accountDetail(id: Account.ID) async throws -> AccountDetail? { nil }

    func waitForSearch(_ search: String) async {
        guard search == delayedSearch, !delayedRequestStarted else { return }
        await withCheckedContinuation { requestWaiter = $0 }
    }

    func releaseDelayedSearch() {
        delayedContinuation?.resume(returning: delayedPage)
        delayedContinuation = nil
    }
}
