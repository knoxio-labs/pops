import DesignSystem
import SwiftUI

/// What a receipt upload resolved to.
///
/// It renders and it retries; every decision — whether an outcome has
/// landed, whether the call ever got far enough to answer with one — is
/// ``ReceiptResultViewModel``'s. Same split as `TransactionDetailView`.
///
/// The screen draws no navigation chrome of its own: whoever embeds it — the
/// capture flow — owns where it sits and what the bar says.
public struct ReceiptResultView: View {
    @State private var model: ReceiptResultViewModel

    private let presentation = ReceiptResultPresentation()

    public init(model: ReceiptResultViewModel) {
        _model = State(wrappedValue: model)
    }

    public var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.popsBackground)
            .task { await model.submit() }
    }

    /// `internal` rather than `private` so a test can render one state at a
    /// time without going through `body`'s `.task` — the same reason
    /// `ReceiptCapturePrompt` was split out as its own type instead of a
    /// private computed property.
    @ViewBuilder internal var content: some View {
        switch model.state {
        case .submitting:
            LoadingStateView(message: ReceiptResultCopy.submitting)
                .accessibilityIdentifier(ReceiptResultAccessibility.submitting)
        case .failed(let error):
            ErrorStateView(
                message: ReceiptResultCopy.message(for: error),
                retryTitle: ReceiptResultCopy.retry,
                retryAccessibilityIdentifier: ReceiptResultAccessibility.retryButton
            ) {
                Task { await model.submit() }
            }
        case .outcome(let outcome):
            outcomeCard(presentation.content(outcome))
        }
    }

    /// A `ScrollView` unconditionally, and not because the content is long.
    /// At the accessibility text sizes it is, and a screen that only becomes
    /// scrollable when it overflows is one that clips for exactly the
    /// readers who cannot afford it.
    private func outcomeCard(_ content: ReceiptResultContent) -> some View {
        ScrollView {
            ReceiptResultCard(content: content)
                .padding(PopsSpacing.lg)
        }
    }
}
