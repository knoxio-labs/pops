import AppCore
import DesignSystem
import SwiftUI

/// The accounts list.
///
/// It renders and it forwards gestures; every decision is
/// ``AccountsListViewModel``'s. No creation, edit or archive action appears
/// anywhere on this screen — those are desktop-scale jobs POPS-2811
/// deliberately leaves there.
public struct AccountsListView: View {
    @State private var model: AccountsListViewModel

    public init(model: AccountsListViewModel) {
        _model = State(wrappedValue: model)
    }

    public var body: some View {
        @Bindable var bindable = model

        return
            content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.popsBackground)
            .task { await model.loadAccounts() }
            .onChange(of: model.refreshFailure) { _, failure in
                announce(failure.map { AccountsCopy.message(for: $0) })
            }
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .loading:
            LoadingStateView(message: AccountsCopy.loading)
        case .failed(let error):
            ErrorStateView(
                message: AccountsCopy.message(for: error),
                retryTitle: AccountsCopy.retry
            ) {
                Task { await model.loadAccounts() }
            }
        case .empty:
            EmptyStateView(message: AccountsCopy.empty)
        case .loaded:
            scrollingContent
        }
    }

    private func announce(_ message: String?) {
        guard let message else { return }
        AccessibilityNotification.Announcement(message).post()
    }
}

extension AccountsListView {
    private var scrollingContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                header
                searchField
                refreshBanner
                sections
            }
            .padding(PopsSpacing.lg)
        }
        .scrollBounceBehavior(.always)
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
        let archived = accounts.filter(\.archived).count
        return AccountsCopy.countLine(active: accounts.count - archived, archived: archived)
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
        }
    }

    /// A section with nothing in it renders nothing at all — no empty header
    /// left standing over a section a search or an archived-off toggle emptied
    /// out, the same call `accounts.tsx`'s `Section` makes.
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
                        .accessibilityIdentifier(AccountsAccessibility.row(account.id))
                    }
                }
            }
        }
    }

    @ViewBuilder private var archivedToggle: some View {
        if hasArchivedAccounts {
            PopsButton(model.showArchived ? "Hide archived" : "Show archived") {
                model.showArchived.toggle()
            }
        }
    }

    private var hasArchivedAccounts: Bool {
        guard case .loaded(let accounts) = model.state else { return false }
        return accounts.contains { $0.archived }
    }

    @ViewBuilder private var refreshBanner: some View {
        if let failure = model.refreshFailure {
            PopsCard {
                VStack(alignment: .leading, spacing: PopsSpacing.md) {
                    Text(AccountsCopy.message(for: failure))
                        .font(.popsBody)
                        .foregroundStyle(Color.popsDestructive)
                    PopsButton(AccountsCopy.retry) { Task { await model.refresh() } }
                }
            }
        }
    }
}
