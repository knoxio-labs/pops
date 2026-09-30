import AppCore
import DesignSystem
import DesignSystemTestSupport
import Foundation
import SwiftUI
import Testing

@testable import FeatureAccounts

@MainActor
@Suite("Accounts list loading presentation")
internal struct AccountsListLoadingTests {
    private static let sourceDirectory = URL(filePath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appending(path: "Sources/FeatureAccounts")

    private static let canvas = CGSize(width: 390, height: 844)

    private func source(_ file: String) throws -> String {
        try String(contentsOf: Self.sourceDirectory.appending(path: file), encoding: .utf8)
    }

    private func render(_ view: some View) -> Data? {
        let renderer = ImageRenderer(
            content: view.frame(width: Self.canvas.width, height: Self.canvas.height))
        renderer.scale = 1
        guard let image = renderer.cgImage, let pixels = image.dataProvider?.data else {
            return nil
        }
        return pixels as Data
    }

    @Test("initial loading draws an account list skeleton", .requiresCompiledColorCatalog)
    func initialLoadingDrawsContentShapes() throws {
        let skeleton = try #require(render(AccountsListSkeleton()))
        let background = try #require(render(Color.popsBackground))

        #expect(skeleton != background)
    }

    @Test("the list replaces initial and paging spinners with account cards")
    func listUsesAccountPlaceholders() throws {
        let list = try source("AccountsListView.swift")

        #expect(list.contains("AccountsListSkeleton()"))
        #expect(list.contains("AccountGridSkeleton(rows: 2"))
        #expect(list.contains("AccountGridSkeleton(rows: 4"))
        #expect(!list.contains("LoadingStateView(message: AccountsCopy.loading)"))
        #expect(list.contains(".popsMotion(PopsMotion.smooth, value: model.state)"))
        #expect(list.contains(".popsMotion(PopsMotion.smooth, value: model.paging)"))
        #expect(list.contains(".transition(PopsMotion.row)"))
    }

    @Test("picker and account transaction collections use lazy stacks")
    func nestedCollectionsAreLazy() throws {
        let list = try source("AccountsListView.swift")
        let picker = try source("AccountPickerView.swift")
        let accountRow = try source("AccountRowView.swift")
        let recent = try source("AccountRecentTransactionsView.swift")
        let rowStart = try #require(picker.range(of: "private func rows(_ accounts: [Account])"))
        let pickerRows = picker[rowStart.lowerBound...]

        #expect(list.contains("LazyVGrid("))
        #expect(list.contains("ForEach(accounts)"))
        #expect(picker.contains("LazyVStack(alignment: .leading, spacing: PopsSpacing.lg)"))
        #expect(pickerRows.contains("LazyVStack"))
        #expect(pickerRows.contains("ForEach(accounts)"))
        #expect(picker.contains(".popsMotion(PopsMotion.smooth, value: sections)"))
        #expect(accountRow.contains(".popsMotion(PopsMotion.snappy, value: selected)"))
        #expect(recent.contains("LazyVStack"))
        #expect(recent.contains("ForEach(transactions)"))
        #expect(recent.contains(".popsMotion(PopsMotion.smooth, value: transactions)"))
    }

    @Test("refresh placeholders stay active only while the refresh request is pending")
    func refreshPlaceholderTracksTheRequest() async {
        let current = Account.fake(id: "current")
        let refreshed = Account.fake(id: "refreshed")
        let repository = SuspendedRefreshAccountsRepository(
            initial: AccountsPage(accounts: [current], nextCursor: nil, totalCount: 1),
            refreshed: AccountsPage(accounts: [refreshed], nextCursor: nil, totalCount: 1)
        )
        let model = AccountsListViewModel(
            dependencies: .fake(accounts: repository), router: Router())
        await model.loadAccounts()

        let refresh = Task { await model.refresh() }
        await repository.waitForRefresh()

        #expect(model.isRefreshing)
        #expect(model.state == .loaded([current]))

        await repository.releaseRefresh()
        await refresh.value

        #expect(!model.isRefreshing)
        #expect(model.state == .loaded([refreshed]))
    }
}

private actor SuspendedRefreshAccountsRepository: AccountsRepository {
    private let initial: AccountsPage
    private let refreshed: AccountsPage
    private var pageCalls = 0
    private var refreshHasStarted = false
    private var refreshContinuation: CheckedContinuation<AccountsPage, Never>?
    private var startContinuation: CheckedContinuation<Void, Never>?

    init(initial: AccountsPage, refreshed: AccountsPage) {
        self.initial = initial
        self.refreshed = refreshed
    }

    func accounts() async throws -> [Account] { initial.accounts }

    func accountPage(
        search: String?,
        archiveScope: AccountsArchiveScope,
        cursor: String?,
        limit: Int
    ) async throws -> AccountsPage {
        pageCalls += 1
        guard pageCalls > 1 else { return initial }
        return await withCheckedContinuation { continuation in
            refreshContinuation = continuation
            refreshHasStarted = true
            startContinuation?.resume()
            startContinuation = nil
        }
    }

    func accountDetail(id: Account.ID) async throws -> AccountDetail? { nil }

    func waitForRefresh() async {
        guard !refreshHasStarted else { return }
        await withCheckedContinuation { startContinuation = $0 }
    }

    func releaseRefresh() {
        refreshContinuation?.resume(returning: refreshed)
        refreshContinuation = nil
    }
}
