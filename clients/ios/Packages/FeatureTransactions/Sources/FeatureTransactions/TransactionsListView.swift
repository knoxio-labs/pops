import AppCore
import DesignSystem
import SwiftUI

/// The transactions list: the first screen in this app that shows data a
/// server owns.
///
/// It renders and it forwards gestures. Every decision — whether there is more
/// to fetch, what a failure halfway down means, whether an empty answer is an
/// empty list or an outage — is ``TransactionsListViewModel``'s, which is what
/// makes those answers assertable without a simulator.
///
/// The screen draws no navigation chrome of its own. The composition root owns
/// where this sits and what the bar says; a feature that titled itself would
/// have to be untitled again by whoever embeds it.
public struct TransactionsListView: View {
    @State private var model: TransactionsListViewModel
    @State private var pendingRetry: Task<Void, Never>?
    @Environment(\.errorPresenter) private var errorPresenter

    private let presentation: TransactionPresentation

    public init(model: TransactionsListViewModel) {
        _model = State(wrappedValue: model)
        presentation = TransactionPresentation()
    }

    public var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.popsBackground)
            .popsMotion(PopsMotion.smooth, value: model.state)
            .popsMotion(PopsMotion.smooth, value: model.paging)
            .popsMotion(PopsMotion.smooth, value: model.isRefreshing)
            .task { await model.loadFirstPage() }
            .onDisappear { pendingRetry?.cancel() }
            // Spoken, not merely drawn. VoiceOver does not move focus to a
            // banner that appears above the content or to a footer below it, so
            // without this a failed refresh reads as the gesture having done
            // nothing at all.
            .onChange(of: model.refreshFailure) { _, failure in
                guard let failure else { return }
                errorPresenter.present(
                    PopsError(
                        repositoryError: failure,
                        fallbackMessage: TransactionsCopy.refreshFailure(failure)),
                    operation: "Refresh transactions",
                    context: .foreground)
            }
            .onChange(of: model.paging) { _, paging in
                guard case .failed(let error) = paging else { return }
                errorPresenter.present(
                    PopsError(
                        repositoryError: error,
                        fallbackMessage: TransactionsCopy.loadMoreFailure(error)),
                    operation: "Load more transactions",
                    context: .background)
                announce(TransactionsCopy.loadMoreFailure(error))
            }
            .errorDiagnosticsMenu()
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .loading:
            TransactionsListSkeleton()
                .transition(PopsMotion.row)
        case .failed(let error):
            failureState(for: error)
                .transition(PopsMotion.row)
        case .empty, .loaded:
            scrollingContent.transition(PopsMotion.row)
        }
    }

    @ViewBuilder private func failureState(for error: RepositoryError) -> some View {
        if TransactionsCopy.offersRetry(for: error) {
            ErrorStateView(
                message: TransactionsCopy.message(for: error),
                retryTitle: TransactionsCopy.retryTitle(for: error)
            ) {
                scheduleRetry(after: error) { await model.loadFirstPage() }
            }
            .disabled(pendingRetry != nil)
        } else {
            NonRetryableErrorStateView(message: TransactionsCopy.message(for: error))
        }
    }

    private func announce(_ message: String?) {
        guard let message else { return }
        AccessibilityNotification.Announcement(message).post()
    }
}

extension TransactionsListView {
    /// One scroll view over every state that has something to pull on.
    ///
    /// `scrollBounceBehavior(.always)` because the empty state is shorter than
    /// the screen, and a scroll view whose content fits does not bounce — which
    /// would leave the one state where a refresh is most obviously worth trying
    /// as the one state where the gesture does nothing.
    private var scrollingContent: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: PopsSpacing.zero) {
                if model.isRefreshing {
                    TransactionRowSkeleton(accessibilityLabel: TransactionsCopy.refreshing)
                        .transition(PopsMotion.row)
                }
                rows
                pagingFooter
            }
            .padding(PopsSpacing.lg)
        }
        .scrollBounceBehavior(.always, axes: .vertical)
        .refreshable { await model.refresh() }
        // Names the screen rather than any one row, so a flow can say "the
        // list is up" before saying what is on it — and get told which of the
        // two failed rather than only that something did.
        .accessibilityIdentifier(TransactionsAccessibility.list)
    }

    /// Each row is a `Button` so it is tappable, and so VoiceOver announces it
    /// as one — a tap target that reads as static text is one a reader has no
    /// reason to try. `.plain` because the row already owns how it looks: the
    /// default style would tint the whole row accent, which is a colour
    /// decision belonging to `DesignSystem` rather than to a gesture.
    ///
    /// Where the tap goes is the model's business. This names no destination,
    /// which is what keeps the detail screen's concrete type out of this file.
    @ViewBuilder private var rows: some View {
        if case .loaded(let transactions) = model.state {
            ForEach(transactions) { transaction in
                Button {
                    model.select(transaction)
                } label: {
                    TransactionRowView(transaction: transaction, presentation: presentation)
                }
                .buttonStyle(.plain)
                .transition(PopsMotion.row)
                .accessibilityIdentifier(TransactionsAccessibility.row(transaction.id))
            }
        } else {
            EmptyStateView(message: TransactionsCopy.empty)
                .transition(PopsMotion.row)
        }
    }
}

extension TransactionsListView {
    /// The tail of the list, and the only thing that asks for another page.
    ///
    /// `idle` and `loading` draw the same row placeholders: appearing is what
    /// starts the fetch, so the rows remain in place until their data arrives.
    @ViewBuilder private var pagingFooter: some View {
        switch model.paging {
        case .exhausted:
            EmptyView()
        case .idle, .loading:
            TransactionPageSkeleton()
                .transition(PopsMotion.row)
                // `.task` rather than `.onAppear` with a `Task` inside it: an
                // unstructured task is not tied to this view's lifetime, so
                // scrolling away or navigating out leaves the fetch running and
                // the view model's cancellation handling with nothing to react
                // to. Same trigger, cancelled when the footer goes away.
                .task(id: model.pageRevision) { await model.loadNextPageIfNeeded() }
        case .failed(let error):
            failedFooter(error)
        }
    }

    /// Retry is a button rather than the footer reappearing, because the row
    /// that provoked the failure is still on screen: an appearance-triggered
    /// retry would fire again on the next layout pass and keep firing, against
    /// a server that has already said no, on whatever connection the phone has.
    private func failedFooter(_ error: RepositoryError) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            Text(TransactionsCopy.loadMoreFailure(error))
                .font(.popsBody)
                .foregroundStyle(Color.popsDestructive)
            PopsButton(TransactionsCopy.retryTitle(for: error)) {
                scheduleRetry(after: error) { await model.retryNextPage() }
            }
            .disabled(pendingRetry != nil)
        }
        .padding(.vertical, PopsSpacing.lg)
    }

    @MainActor
    private func scheduleRetry(
        after error: RepositoryError, action: @escaping @MainActor () async -> Void
    ) {
        guard pendingRetry == nil else { return }
        pendingRetry = Task { @MainActor in
            defer { pendingRetry = nil }
            await TransactionsRetry.perform(after: error, retry: action)
        }
    }
}
