import AppCore
import DesignSystem
import SwiftUI

/// One account, read-only.
///
/// It renders and it forwards gestures; every decision is
/// ``AccountDetailViewModel``'s. There is no "Add transaction" or "Import"
/// action anywhere on this screen and no edit or archive control — those are
/// desktop-scale jobs POPS-2811 explicitly leaves there. The web dashboard
/// this mirrors carries a floating "Add transaction" button; the equivalent
/// Dynamic Type risk the ticket names — two actions that must stack at
/// accessibility sizes — does not apply here, because neither action ships in
/// this read-only build. See this ticket's report.
public struct AccountDetailView: View {
    @State private var model: AccountDetailViewModel

    public init(model: AccountDetailViewModel) {
        _model = State(wrappedValue: model)
    }

    public var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.popsBackground)
            .task { await model.load() }
            .onChange(of: model.failure) { _, failure in
                guard let failure else { return }
                AccessibilityNotification.Announcement(AccountsCopy.detailFailure(failure)).post()
            }
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .loading:
            LoadingStateView(message: AccountsCopy.loadingDetail)
        case .notFound:
            EmptyStateView(message: AccountsCopy.detailNotFound)
        case .failed(let error):
            ErrorStateView(
                message: AccountsCopy.message(for: error),
                retryTitle: AccountsCopy.retry
            ) {
                Task { await model.load() }
            }
        case .seeded(let account):
            record(header: account, detail: nil)
        case .loaded(let detail):
            record(header: detail.account, detail: detail)
        }
    }

    @ViewBuilder
    private func record(header account: Account, detail: AccountDetail?) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                failureBanner
                AccountDetailHeaderView(account: account)
                if let detail {
                    AccountTrendCardView(account: account, history: detail.history)
                    AccountFactsView(detail: detail)
                    AccountRecentTransactionsView(transactions: detail.recentTransactions)
                }
            }
            .padding(PopsSpacing.lg)
        }
        .accessibilityIdentifier(AccountsAccessibility.detail)
    }

    @ViewBuilder private var failureBanner: some View {
        if let failure = model.failure {
            PopsCard {
                VStack(alignment: .leading, spacing: PopsSpacing.md) {
                    Text(AccountsCopy.detailFailure(failure))
                        .font(.popsBody)
                        .foregroundStyle(Color.popsDestructive)
                    PopsButton(AccountsCopy.retry) { Task { await model.load() } }
                }
            }
        }
    }
}
