import AppCore
import DesignSystem
import SwiftUI

/// The accounts list.
public struct AccountsListView: View {
    @State private var model: AccountsListViewModel
    @Environment(\.errorPresenter) private var errorPresenter

    /// Creates the account list view backed by its feature model.
    public init(model: AccountsListViewModel) {
        _model = State(wrappedValue: model)
    }

    public var body: some View {
        return
            content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.popsBackground)
            .popsMotion(PopsMotion.smooth, value: model.state)
            .popsMotion(PopsMotion.smooth, value: model.paging)
            .popsMotion(PopsMotion.smooth, value: model.isRefreshing)
            .task(id: model.requestFilter) { await model.loadAccounts() }
            .onChange(of: model.refreshFailure) { _, failure in
                guard let failure else { return }
                errorPresenter.present(
                    PopsError(
                        repositoryError: failure,
                        fallbackMessage: AccountsCopy.refreshFailure(failure)),
                    operation: "Refresh accounts",
                    context: .foreground)
            }
            .onChange(of: model.pageFailure) { _, failure in
                guard let failure else { return }
                errorPresenter.present(
                    PopsError(
                        repositoryError: failure,
                        fallbackMessage: AccountsCopy.loadMoreFailure(failure)),
                    operation: "Load more accounts",
                    context: .background)
                AccessibilityNotification.Announcement(
                    AccountsCopy.loadMoreFailure(failure)
                ).post()
            }
            .errorDiagnosticsMenu()
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .loading:
            AccountsListSkeleton()
                .transition(PopsMotion.row)
        case .failed(let error):
            ErrorStateView(
                message: AccountsCopy.message(for: error),
                retryTitle: AccountsCopy.retry
            ) {
                Task { await model.loadAccounts() }
            }
            .transition(PopsMotion.row)
        case .empty, .loaded:
            scrollingContent.transition(PopsMotion.row)
        }
    }
}

extension AccountsListView {
    private var scrollingContent: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: PopsSpacing.lg) {
                header
                searchField
                if model.isRefreshing {
                    AccountGridSkeleton(rows: 2, accessibilityLabel: AccountsCopy.refreshing)
                        .transition(PopsMotion.row)
                }
                sections
                pagingFooter
            }
            .padding(PopsSpacing.lg)
        }
        .scrollBounceBehavior(.always, axes: .vertical)
        .refreshable { await model.refresh() }
        .accessibilityIdentifier(AccountsAccessibility.list)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(AccountsCopy.title)
                .font(.popsLargeTitle)
                .foregroundStyle(Color.popsForeground)
            Text(countLine)
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsMutedForeground)
        }
    }

    private var countLine: String {
        guard case .loaded(let accounts) = model.state else { return "" }
        return AccountsCopy.countLine(active: model.totalCount ?? accounts.count, archived: 0)
    }

    private var searchField: some View {
        @Bindable var bindable = model
        return PopsTextField(
            placeholder: AccountsCopy.searchPlaceholder, text: $bindable.searchText)
    }

    @ViewBuilder private var sections: some View {
        let sections = model.sections
        VStack(alignment: .leading, spacing: PopsSpacing.xl) {
            section(title: AccountsCopy.sectionHeld, accounts: sections.held)
            section(title: AccountsCopy.sectionOwed, accounts: sections.owed)
            archivedToggle
            if model.showArchived {
                section(title: AccountsCopy.sectionArchived, accounts: sections.archived)
            }
            if sections.isEmpty {
                Text(emptyMessage)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsMutedForeground)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, PopsSpacing.lg)
                    .transition(PopsMotion.row)
            }
        }
    }

    private var emptyMessage: String {
        guard model.searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return AccountsCopy.noMatches
        }
        return model.showArchived ? AccountsCopy.empty : AccountsCopy.noActiveAccounts
    }

    @ViewBuilder
    private func section(title: String, accounts: [Account]) -> some View {
        if !accounts.isEmpty {
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                Text(title)
                    .font(.popsSectionLabel)
                    .foregroundStyle(Color.popsMutedForeground)
                LazyVGrid(
                    columns: [GridItem(.flexible()), GridItem(.flexible())],
                    spacing: PopsSpacing.md
                ) {
                    ForEach(accounts) { account in
                        Button {
                            model.select(account)
                        } label: {
                            AccountCardView(account: account)
                        }
                        .buttonStyle(.plain)
                        .transition(PopsMotion.row)
                        .accessibilityIdentifier(AccountsAccessibility.row(account.id))
                    }
                }
            }
        }
    }

    private var archivedToggle: some View {
        PopsButton(model.showArchived ? AccountsCopy.hideArchived : AccountsCopy.showArchived) {
            model.showArchived.toggle()
        }
    }

    @ViewBuilder private var pagingFooter: some View {
        switch model.paging {
        case .exhausted:
            EmptyView()
        case .idle, .loading:
            AccountGridSkeleton(rows: 4, accessibilityLabel: AccountsCopy.loadingMore)
                .transition(PopsMotion.row)
                .task(id: model.pageRevision) { await model.loadNextPageIfNeeded() }
        case .failed(let error):
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                Text(AccountsCopy.loadMoreFailure(error))
                    .font(.popsBody)
                    .foregroundStyle(Color.popsDestructive)
                PopsButton(AccountsCopy.retry) { Task { await model.retryNextPage() } }
            }
            .padding(.vertical, PopsSpacing.lg)
        }
    }
}
