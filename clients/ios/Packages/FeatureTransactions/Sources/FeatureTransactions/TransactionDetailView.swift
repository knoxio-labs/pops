import AppCore
import DesignSystem
import SwiftUI

/// One transaction, in full.
///
/// It renders and it forwards gestures. Every decision — whether a missing
/// record is an absence or a failure, whether a failure replaces what is on
/// screen or sits beside it — is ``TransactionDetailViewModel``'s.
///
/// The screen draws no navigation chrome of its own, for the same reason the
/// list does not: whoever embeds it owns where it sits and what the bar says,
/// and a screen that titled itself would have to be untitled again.
public struct TransactionDetailView: View {
    @State private var model: TransactionDetailViewModel
    @Environment(\.errorPresenter) private var errorPresenter

    private let presentation: TransactionDetailPresentation

    public init(model: TransactionDetailViewModel) {
        _model = State(wrappedValue: model)
        presentation = TransactionDetailPresentation()
    }

    public var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.popsBackground)
            .task { await model.load() }
            // Spoken, not merely drawn. VoiceOver does not move focus to a
            // banner that appears above the content, so without this a failed
            // fetch reads as the screen having simply stopped filling in.
            .onChange(of: model.failure) { _, failure in
                guard let failure else { return }
                errorPresenter.present(
                    PopsError(
                        repositoryError: failure,
                        fallbackMessage: TransactionsCopy.detailFailure(failure)),
                    operation: "Load transaction details",
                    context: .foreground)
            }
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .loading:
            LoadingStateView(message: TransactionsCopy.loadingDetail)
        case .notFound:
            // The empty treatment, not the error one, and that is the whole
            // point of keeping the two states apart: muted rather than
            // destructive, and no retry to press against an answer that will
            // not change.
            EmptyStateView(message: TransactionsCopy.detailNotFound)
        case .failed(let error):
            ErrorStateView(
                message: TransactionsCopy.message(for: error),
                retryTitle: TransactionsCopy.retry
            ) {
                Task { await model.load() }
            }
        case .seeded(let transaction):
            record(presentation.content(transaction))
        case .loaded(let detail):
            record(presentation.content(detail))
        }
    }
}

extension TransactionDetailView {
    /// The screen with something on it: the reason anything is missing, then
    /// the record itself.
    ///
    /// A `ScrollView` unconditionally, and not because the content is long. At
    /// the accessibility text sizes it is, and a screen that only becomes
    /// scrollable when it overflows is one that clips for exactly the readers
    /// who cannot afford it.
    private func record(_ content: TransactionDetailContent) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                TransactionDetailCard(content: content)
            }
            .padding(PopsSpacing.lg)
        }
        // On the record, not on the screen: the loading, not-found and failed
        // states deliberately do not carry it, so finding this identifier
        // means something is drawn rather than that a screen was pushed. It
        // does not distinguish the seeded record from the fetched one — both
        // are records — which is why the flow goes on to assert a line only
        // the fetched one has.
        .accessibilityIdentifier(TransactionsAccessibility.detail)
    }
}
